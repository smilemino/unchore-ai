// Unread answers per chat (ported from AI Soul lib/read-marks.ts + lib/server/read-marks.ts). The server keeps how many answers the
// member has seen in each chat (conversations.seen_ai, db/migrations/008), so a chat read on the phone is read on the computer too.
// Chats that existed before started fully read (no wall of numbers); the chat on screen counts as read.
export type ReadRow = { id: string; ai_count?: number | null; seen_ai?: number | null };

/** New answers not seen yet (0 for the chat on screen). */
export function unreadOf(row: ReadRow, open: string | null = null): number {
  if (row.id === open) return 0;
  return Math.max(0, (row.ai_count ?? 0) - (row.seen_ai ?? row.ai_count ?? 0));
}

/** The chat on screen, if it has answers the server doesn't know were seen → the count to send. */
export function seenToSend(rows: ReadRow[], open: string | null): { id: string; seen: number } | null {
  const r = open ? rows.find((x) => x.id === open) : undefined;
  return r && (r.ai_count ?? 0) > (r.seen_ai ?? 0) ? { id: r.id, seen: r.ai_count ?? 0 } : null;
}
