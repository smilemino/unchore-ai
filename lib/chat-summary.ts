// «View summary» on the long-chat line (components/ContextNote.tsx): the summary the AI reads instead of the older messages
// (lib/turn.ts olderSummary). Only the member's own chat; undefined = no such chat of theirs, null = no summary yet.
import { one } from "./db";
import { unlockOrNull } from "./privacy";

export async function chatSummary(convId: string, userId: string): Promise<{ text: string | null; upto: number } | undefined> {
  const c = await one<{ summary: string | null; summary_upto: number }>("select summary, summary_upto from conversations where id = $1 and user_id = $2", [convId, userId]);
  if (!c) return undefined;
  const text = unlockOrNull(c.summary)?.trim() || null;
  return { text, upto: text ? c.summary_upto : 0 };
}
