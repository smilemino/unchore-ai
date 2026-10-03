import { q } from "./db";
import { lock } from "./privacy";

// Memory history (ported from AI Soul lib/memory-journey.ts «배운 흐름»): when each memory was noted, changed or dropped, from which chat,
// and whether the AI or the member did it. Never throws — memory itself must not fail because the history couldn't be written.
export type MemoryAction = "added" | "updated" | "removed";
export async function logMemory(userId: string, action: MemoryAction, text: string, o: { memoryId?: string | null; convId?: string | null; byAi?: boolean } = {}): Promise<void> {
  try {
    await q("insert into memory_log(user_id, memory_id, action, text, by_ai, conversation_id) values ($1, $2, $3, $4, $5, $6)",
      [userId, o.memoryId ?? null, action, lock(text.slice(0, 1000)), Boolean(o.byAi), o.convId ?? null]);
  } catch { /* history only */ }
}
