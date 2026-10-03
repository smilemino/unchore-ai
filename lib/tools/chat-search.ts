// «What did we say about X last time?» — the member's own earlier chats, searched (2026-10-02: one of the «I can't» answers
// lib/gaps.ts caught was «look through all my past conversations»; AI Soul answers it from its records). Chats are locked at rest
// (lib/privacy.ts), so the words can't be searched in the database: this member's rows are opened here, in this request, and only
// the matching lines go back to their AI.
import { q } from "../db";
import { unlock } from "../privacy";

export type ChatRow = { conv: string; title: string | null; role: string; at: string; content: string };
export type ChatHit = { conv: string; title: string; role: string; at: string; snippet: string };

const words = (s: string) => s.toLowerCase().split(/\s+/).map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")).filter((w) => w.length > 0);

/** Lines holding every word of the query (any order), newest first, one hit per chat unless few chats match. */
export function findInChats(rows: ChatRow[], query: string, max = 8): ChatHit[] {
  const want = words(query);
  if (!want.length) return [];
  const hits: ChatHit[] = [], seen = new Map<string, number>();
  for (const r of rows) {
    const low = r.content.toLowerCase();
    if (!want.every((w) => low.includes(w))) continue;
    const n = seen.get(r.conv) ?? 0;
    if (n >= 2) continue;
    seen.set(r.conv, n + 1);
    const at = Math.max(0, low.indexOf(want[0] ?? "") - 120);
    const snippet = `${at > 0 ? "…" : ""}${r.content.slice(at, at + 320).replace(/\s+/g, " ").trim()}${at + 320 < r.content.length ? "…" : ""}`;
    hits.push({ conv: r.conv, title: r.title?.trim() || "(untitled)", role: r.role, at: r.at, snippet });
    if (hits.length >= max) break;
  }
  return hits;
}

/** The tool: this member's chats other than the current one, newest 20,000 messages. */
export async function searchChats(userId: string, convId: string, query: string, tz: string): Promise<string> {
  const rows = (await q<{ conv: string; title: string | null; role: string; at: Date; content: string }>(
    `select m.conversation_id as conv, c.title, m.role, m.created_at as at, m.content from messages m join conversations c on c.id = m.conversation_id
     where c.user_id = $1 and c.id <> $2 and m.role in ('user', 'assistant') and not m.superseded order by m.created_at desc limit 20000`, [userId, convId],
  )).map((r) => ({ conv: r.conv, title: unlock(r.title), role: r.role, at: new Date(r.at).toLocaleDateString("en-CA", { timeZone: tz || "UTC" }), content: unlock(r.content) }));
  const hits = findInChats(rows, query);
  if (!hits.length) return `No earlier chat of this member mentions «${query}» (searched ${rows.length} messages). Try fewer or other words.`;
  return hits.map((h) => `• ${h.at} «${h.title}» (${h.role === "user" ? "member" : "AI"}): ${h.snippet}`).join("\n");
}
