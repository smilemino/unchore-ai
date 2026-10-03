import { one } from "./db";

/** Did this very answer already set a reminder in the chat? Then a switch-on card would build the same thing twice
 *  (night test 2026-09-30 round 2: 6 of 10 new members ended up with two automations for one ask). */
export async function reminderJustSet(userId: string, answerId: string): Promise<boolean> {
  const r = await one<{ x: number }>(
    `select 1 as x from automations a join messages m on m.id = $2
      where a.user_id = $1 and a.recipe = 'prompt' and a.args->>'conversationId' = m.conversation_id::text and coalesce(a.args->>'kind', '') <> 'nudge'
        and a.created_at >= (select max(q.created_at) from messages q where q.conversation_id = m.conversation_id and q.role = 'user' and q.created_at <= m.created_at)
      limit 1`, [userId, answerId]);
  return !!r;
}
