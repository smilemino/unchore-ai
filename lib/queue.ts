import { asMember, one, q } from "./db";
import { unlock } from "./privacy";

// Waiting messages (ported from AI Soul lib/server/queue.ts + components/QueueBar.tsx): typed while an answer is being written,
// kept on the server so closing the window doesn't lose them. The open screen sends them in order when the answer ends; if no
// screen is there, the minute timer sends the oldest one of an idle chat (drainQueue). ■ Stop holds them until «Send».
export const QUEUE_MAX = 20;
/** A waiting message the screen hasn't sent for this long is the timer's to send (the screen may be closed). */
export const QUEUE_ORPHAN_MS = 3 * 60_000;

type Due = { id: string; user_id: string; conversation_id: string; text: string; file_ids: string[] };

/** The minute timer: for each idle chat, the oldest waiting message nobody sent → one turn. At most `max` per tick. */
export async function drainQueue(max = 3): Promise<number> {
  const due = await q<Due>(`select distinct on (cq.conversation_id) cq.id, cq.user_id, cq.conversation_id, cq.text, cq.file_ids from chat_queue cq
      where not cq.held and cq.created_at < now() - ($1 || ' milliseconds')::interval
        and not exists (select 1 from messages m where m.conversation_id = cq.conversation_id and m.role = 'user'
                        and m.created_at > now() - interval '10 minutes'
                        and not exists (select 1 from messages a where a.conversation_id = m.conversation_id and a.role = 'assistant' and a.created_at >= m.created_at))
      order by cq.conversation_id, cq.created_at limit $2`, [String(QUEUE_ORPHAN_MS), max]);
  let n = 0;
  const { runTurn } = await import("./turn");
  for (const d of due) {
    const taken = await q<{ created_at: string }>("delete from chat_queue where id = $1 returning created_at", [d.id]);
    if (!taken.length) continue;
    const u = await one<{ lang: string; tz: string; default_model: string | null }>("select lang, tz, default_model from users where id = $1", [d.user_id]);
    if (!u) continue;
    const ok = await asMember(d.user_id, () => runTurn({ id: d.user_id, ...u }, { conversationId: d.conversation_id, text: unlock(d.text), fileIds: d.file_ids })).then(() => true).catch(() => false);
    // Couldn't send (no AI connected, the AI refused before a word): back in the queue, held — never lost, never retried every minute.
    if (!ok) await q("insert into chat_queue(id, user_id, conversation_id, text, file_ids, held, created_at) values ($1, $2, $3, $4, $5, true, $6)", [d.id, d.user_id, d.conversation_id, d.text, d.file_ids, taken[0]!.created_at]).catch(() => null);
    else n++;
  }
  return n;
}
