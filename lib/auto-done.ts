// Chats with nothing left to do move to «Done» by themselves every 30 minutes (AI Soul lib/auto-done.ts · 9b8c57a + 0c00cf1 —
// owner 2026-09-30 «chats that need nothing from me go to done every 30 minutes» · 10/1 «Unchore must do the same»).
// Only the empty circle moves — the same rule as the list's circle (lib/conv-line.ts dotState «idle»): the last message is 10+ minutes old
// and is not an answer that waits for the member (asks), nothing is being written, queued or built for that chat, no task in it is left
// (lib/conv-tasks.ts), and the last answer doesn't end on «⏳ In progress — …» (lib/hold-line.ts). Unread answers move too, like AI Soul (owner 2026-10-02 «the empty circles are not tidied in Unchore») — the
// «Done» group keeps unread chats in view instead (lib/conv-line.ts foldRows). «Done» is conversations.done, so the member's next message,
// a reminder's answer or a build result opens the chat again (lib/turn.ts · lib/build.ts set done = false).
import { q } from "./db";
import { holdLine } from "./hold-line";
import { unlock } from "./privacy";

/** How old the last answer must be — gives the «your turn» judge and a quick follow-up time (AI Soul AUTO_DONE_MIN_AGE_MIN). */
export const AUTO_DONE_MIN_AGE_MIN = 10;
/** Minutes past the hour when the minute timer runs it (two chances each half hour — the timer drifts; a second pass changes nothing). */
export const AUTO_DONE_MINUTES = [20, 21, 50, 51];

export function autoDueNow(now = new Date()): boolean { return AUTO_DONE_MINUTES.includes(now.getUTCMinutes()); }

// The chats that qualify, with the last message — an answer ending on «⏳ In progress — …» waits on something outside and stays
// out (AI Soul lib/auto-done.ts skips «working» · lib/hold-line.ts). Messages are stored locked, so that line is read here, not in SQL.
const WHERE = `c.done = false and c.answering_since is null
    and exists (select 1 from messages m where m.conversation_id = c.id)
    and coalesce((select m.asks from messages m where m.conversation_id = c.id order by m.created_at desc, (m.role = 'assistant') desc limit 1), false) = false
    and (select max(m.created_at) from messages m where m.conversation_id = c.id) < now() - make_interval(mins => $1)
    and not exists (select 1 from chat_queue cq where cq.conversation_id = c.id)
    and not exists (select 1 from builds b where b.conversation_id = c.id and b.status in ('queued', 'running'))
    and not exists (select 1 from computer_jobs j where j.conversation_id = c.id and j.status in ('queued', 'running'))
    and not exists (select 1 from conversation_tasks t where t.conversation_id = c.id and t.status not in ('done', 'dropped'))`;

export const AUTO_DONE_PICK_SQL = `select c.id, l.role as last_role, l.content as last_text from conversations c
  left join lateral (select m.role, m.content from messages m where m.conversation_id = c.id order by m.created_at desc, (m.role = 'assistant') desc limit 1) l on true
  where ${WHERE}`;
// the same rule again when marking — a message that came in between keeps its chat open
export const AUTO_DONE_SQL = `update conversations c set done = true where c.id = any($2::uuid[]) and ${WHERE} returning c.id`;

/** Which picked chats may move — not one whose last answer waits on something outside. */
export function autoDoneIds(rows: { id: string; last_role: string | null; last_text: string | null }[]): string[] {
  return rows.filter((r) => !(r.last_role === "assistant" && holdLine(unlock(r.last_text)))).map((r) => r.id);
}

/** Marks them done; returns how many moved. */
export async function autoDone(): Promise<number> {
  const ids = autoDoneIds(await q<{ id: string; last_role: string | null; last_text: string | null }>(AUTO_DONE_PICK_SQL, [AUTO_DONE_MIN_AGE_MIN]));
  return ids.length ? (await q<{ id: string }>(AUTO_DONE_SQL, [AUTO_DONE_MIN_AGE_MIN, ids])).length : 0;
}
