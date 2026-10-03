import { subInterject } from "./claude-sub";
import { q } from "./db";
import { lock, unlock } from "./privacy";
import { attachFiles } from "./uploads";

// Interjecting (ported from AI Soul worker/engines/claude.ts, 2026-09-25): a message typed while the member's Claude plan is answering
// goes into that same answer instead of waiting for it to end (lib/queue.ts). Claude Code reads new words after each step, so the
// answer can change course. Files sent with it go in too when they are ready to read (AI Soul 2026-09-26 «files mid-answer too»):
// pictures (up to 5, 5 MB each) and files whose text was already read at upload. A video or sound not yet turned into text, a big
// file, a held message (■ Stop) or one the plan no longer takes stays in the queue and is sent as its own turn, as before.
// Nothing is lost: a message the worker didn't take goes back exactly as it was.
export const INTERJECT_EVERY_MS = 3000;
export const INTERJECT_FILES_MAX = 5;
export const INTERJECT_IMAGE_BYTES = 5 * 1024 * 1024;

type Taken = { id: string; text: string; file_ids: string[]; created_at: string };

/** One look: the oldest waiting message of this chat goes into the answer being written. Returns whether one went in. */
export async function interjectOnce(userId: string, convId: string, turn: string, push: typeof subInterject = subInterject): Promise<boolean> {
  // Taken the same way as the screen and the minute timer take it (a delete), so the same message is never sent twice.
  // Ready files: every id is this member's, none is a big file, pictures are small enough, anything else already has its text.
  const [row] = await q<Taken>(`delete from chat_queue where id = (select cq.id from chat_queue cq where cq.conversation_id = $1 and cq.user_id = $2 and not cq.held
      and (cardinality(cq.file_ids) = 0 or cardinality(cq.file_ids) <= $3 and cardinality(cq.file_ids) = (select count(*) from files f where f.user_id = cq.user_id
        and f.id = any(cq.file_ids) and f.parts_of is null and (f.mime ~ '^image/(png|jpeg|gif|webp)$' and f.size <= $4 or f.mime !~ '^image/' and f.text_extract is not null)))
      order by cq.created_at limit 1 for update skip locked) returning id, text, file_ids, created_at::text`, [convId, userId, INTERJECT_FILES_MAX, INTERJECT_IMAGE_BYTES]);
  if (!row) return false;
  const text = unlock(row.text);
  const ids = row.file_ids ?? [];
  const went = await (async () => {
    const f = ids.length ? await attachFiles(userId, ids) : null;
    return push(userId, turn, f?.parts.length ? `${f.parts.join("\n\n")}\n\n${text}` : text, f?.images ?? []);
  })().catch(() => false);
  if (went) {
    // Kept in the chat between the question and this answer — where it was said — with its files.
    const [m] = await q<{ id: string }>("insert into messages(conversation_id, role, content) values ($1, 'user', $2) returning id", [convId, lock(text)]);
    if (ids.length && m) await q("update files set conversation_id = $3, message_id = $4 where user_id = $1 and id = any($2::uuid[])", [userId, ids, convId, m.id]);
    return true;
  }
  await q("insert into chat_queue(id, user_id, conversation_id, text, file_ids, held, created_at) values ($1, $2, $3, $4, $5, false, $6) on conflict do nothing",
    [row.id, userId, convId, row.text, ids, row.created_at]).catch(() => null);
  return false;
}

/** Looks every few seconds while an answer is written; `stop()` ends it and waits for a look in flight (so none is half-done). */
export function watchInterjections(userId: string, convId: string, turn: string, onIn: () => void, push: typeof subInterject = subInterject, everyMs = INTERJECT_EVERY_MS) {
  let flight: Promise<unknown> = Promise.resolve(), stopped = false;
  const timer = setInterval(() => {
    flight = flight.then(async () => { if (!stopped && await interjectOnce(userId, convId, turn, push).catch(() => false)) onIn(); });
  }, everyMs);
  return { stop: async () => { stopped = true; clearInterval(timer); await flight; } };
}
