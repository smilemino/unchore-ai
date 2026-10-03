import { NextResponse } from "next/server";
import { isResp, requireUser } from "@/lib/api";
import { q } from "@/lib/db";
import { unlock } from "@/lib/privacy";
import { hitSnippet, previewLine } from "@/lib/conv-line";
import { holdLine } from "@/lib/hold-line";
import { EMPTY_NOTE_CHAT } from "@/lib/nudge";

type Row = { id: string; title: string; updated_at: string; pinned: boolean; seen_ai: number; project_id: string | null; done: boolean; model: string | null; last_role: string | null; last_at: string | null; ai_count: number; last_text: string | null; asks: boolean | null };

// List (?q= searches titles and message text; ?project= filters). Titles and messages are stored locked, so the search
// opens them here (the user's latest 3,000 messages) instead of in the database.
export async function GET(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const sp = new URL(req.url).searchParams;
  const term = (sp.get("q") ?? "").trim().slice(0, 100).toLowerCase();
  const project = sp.get("project");
  const params: unknown[] = [u.id];
  // the daily note's chat stays out of the list until its first note arrives (lib/nudge.ts EMPTY_NOTE_CHAT)
  let where = `c.user_id = $1 and not ${EMPTY_NOTE_CHAT}`;
  if (project) { params.push(project); where += ` and c.project_id = $${params.length}`; }
  const found = new Map<string, { id: string; text: string }>();
  if (term) {
    const all = await q<{ id: string; title: string }>("select id, title from conversations where user_id = $1", [u.id]);
    const hits = new Set(all.filter((c) => unlock(c.title).toLowerCase().includes(term)).map((c) => c.id));
    const msgs = await q<{ id: string; conversation_id: string; content: string }>(
      "select m.id, m.conversation_id, m.content from messages m join conversations c on c.id = m.conversation_id where c.user_id = $1 order by m.created_at desc limit 3000", [u.id]);
    // the newest message with the words, per chat — shown as «Found in a message» and opened at that message (AI Soul ConvItem)
    for (const m of msgs) {
      if (found.has(m.conversation_id)) continue;
      const text = hitSnippet(unlock(m.content), term);
      if (text) { found.set(m.conversation_id, { id: m.id, text }); hits.add(m.conversation_id); }
    }
    params.push([...hits]);
    where += ` and c.id = any($${params.length}::uuid[])`;
  }
  const rows = await q<Row>(`select c.id, c.title, c.updated_at, c.pinned, c.seen_ai, c.project_id, c.done, c.model,
      (select m.role from messages m where m.conversation_id = c.id order by m.created_at desc, (m.role = 'assistant') desc limit 1) as last_role,
      (select max(m.created_at) from messages m where m.conversation_id = c.id) as last_at,
      (select m.asks from messages m where m.conversation_id = c.id order by m.created_at desc, (m.role = 'assistant') desc limit 1) as asks,
      (select count(*)::int from messages m where m.conversation_id = c.id and m.role = 'assistant') as ai_count,
      (select m.content from messages m where m.conversation_id = c.id and m.role = 'assistant' order by m.created_at desc limit 1) as last_text
    from conversations c where ${where} order by c.pinned desc, case when c.pinned then c.pin_sort end, c.updated_at desc limit 300`, params);
  // One line under each title, like AI Soul's list: the «결론:» / «Conclusion:» line if the answer has one, else its first line.
  // An answer ending on «⏳ In progress — …» shows as in progress with that line (lib/hold-line.ts).
  return NextResponse.json(rows.map((r) => {
    const text = r.last_text ? unlock(r.last_text) : "";
    return { ...r, title: unlock(r.title), last_text: previewLine(text), hold: holdLine(text), hit: found.get(r.id) ?? null };
  }));
}

