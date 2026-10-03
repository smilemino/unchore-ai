import { NextResponse } from "next/server";
import { z } from "zod";
import { isResp, requireUser } from "@/lib/api";
import { asOwner, one, q } from "@/lib/db";
import { esc, sendMail } from "@/lib/mail";
import { lock, lockOrNull, unlock } from "@/lib/privacy";
import { tr } from "@/lib/i18n-server";

// «Report» under an AI answer (Google Play generative-AI rule). Keeps a locked copy of the answer and mails the owners —
// the mail says only why and how many today, never what was said.
const Body = z.object({ messageId: z.string().uuid(), reason: z.enum(["harmful", "false", "other"]), note: z.string().max(1000).optional() });
const DAY_MAX = 30;

export async function POST(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const m = await one<{ content: string; model: string | null }>("select content, model from messages where id = $1 and role = 'assistant'", [b.data.messageId]);   // fenced: only the member's own chats
  if (!m) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const today = await one<{ n: number }>("select count(*)::int as n from answer_reports where user_id = $1 and created_at > now() - interval '1 day'", [u.id]);
  if ((today?.n ?? 0) >= DAY_MAX) return NextResponse.json({ error: "too_many" }, { status: 429 });
  const dup = await one<{ id: string }>("select id from answer_reports where user_id = $1 and message_id = $2", [u.id, b.data.messageId]);
  if (!dup) {
    await q("insert into answer_reports(user_id, message_id, reason, note, answer, model) values ($1, $2, $3, $4, $5, $6)",
      [u.id, b.data.messageId, b.data.reason, lockOrNull(b.data.note?.trim() || null), lock(unlock(m.content)), m.model]);
    void tellOwners(b.data.reason).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}

async function tellOwners(reason: string): Promise<void> {
  const n = (await asOwner(() => one<{ n: number }>("select count(*)::int as n from answer_reports where created_at > now() - interval '1 day'")))?.n ?? 1;
  for (const to of (process.env.OWNER_EMAILS ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
    const lang = (await asOwner(() => one<{ lang: string }>("select lang from users where lower(email) = lower($1)", [to])).catch(() => null))?.lang ?? "ko";
    const why = tr(lang, reason === "harmful" ? "Harmful or offensive" : reason === "false" ? "False or misleading" : "Something else");
    const line = tr(lang, "A member reported an AI answer: {why}. Reports in the last 24 hours: {n}. The answer is kept locked in answer_reports.", { why, n: String(n) });
    await sendMail(to, `Unchore · ${tr(lang, "AI answer reported")}`, `<p>${esc(line)}</p>`, line);
  }
}
