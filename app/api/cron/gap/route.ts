import { NextResponse } from "next/server";
import { z } from "zod";
import { cronOk } from "@/lib/api";
import { one, q } from "@/lib/db";
import { asLang } from "@/lib/i18n";
import { builtMessage } from "@/lib/gaps";
import { lock } from "@/lib/privacy";
import { pushUser } from "@/lib/push";

// AI Soul's check (reminder-gates/unchore-gaps) closes a missing ability here (lib/gaps.ts, 030): «built» tells the member in
// that chat (and by push) that it works now; «skip» only records why. Every open row with the same ability closes with it.
const Body = z.object({ id: z.number().int().positive(), status: z.enum(["built", "skip"]), note: z.string().min(3).max(300) });

export async function POST(req: Request) {
  if (!cronOk(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  const g = await one<{ ability: string }>("select ability from ability_gaps where id = $1", [b.data.id]);
  if (!g) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const rows = await q<{ id: string; user_id: string | null; conversation_id: string | null; lang: string | null }>(
    "update ability_gaps set status = $2, note = $3, done_at = now() where (id = $1 or ability = $4) and status in ('new', 'seen') returning id, user_id, conversation_id, lang",
    [b.data.id, b.data.status, b.data.note, g.ability]);
  let told = 0;
  if (b.data.status === "built") {
    for (const r of rows) {
      if (!r.user_id || !r.conversation_id) continue;
      const text = builtMessage(asLang(r.lang));   // the note (what was built, English) stays in ability_gaps for us
      await q("insert into messages(conversation_id, role, content, model) values ($1, 'assistant', $2, 'unchore')", [r.conversation_id, lock(text)]);
      await q("update conversations set updated_at = now(), done = false where id = $1", [r.conversation_id]);
      await pushUser(r.user_id, { title: "Unchore", body: text.slice(0, 140), url: `/app?c=${r.conversation_id}`, tag: `gap-${r.id}` }).catch(() => 0);
      told++;
    }
  }
  return NextResponse.json({ ok: true, closed: rows.length, told });
}
