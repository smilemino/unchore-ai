import { one, q } from "./db";
import { lock } from "./privacy";

// Earlier versions of «My instructions» (ported from AI Soul lib/top-rules.ts): before any change the current text is kept,
// the latest 20 stay, and any of them can be put back (which keeps the current one in turn).
export const RULES_MAX = 30_000;
export const HISTORY_KEEP = 20;

/** Call right before changing users.instructions. Same text as now, or empty → nothing kept. */
export async function keepRules(userId: string, next: string | null): Promise<void> {
  const cur = await one<{ instructions: string }>("select instructions from users where id = $1", [userId]);
  const text = cur?.instructions ?? "";
  if (!text.trim() || (next !== null && next === text)) return;
  await q("insert into rules_history(user_id, text) values ($1, $2)", [userId, lock(text)]);
  await q("delete from rules_history where user_id = $1 and id not in (select id from rules_history where user_id = $1 order by created_at desc limit $2)", [userId, HISTORY_KEEP]);
}
