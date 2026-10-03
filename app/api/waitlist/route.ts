import { isLang } from "@/lib/i18n";
import { NextResponse } from "next/server";
import { z } from "zod";
import { hasDb, q } from "@/lib/db";
import { esc, sendMail } from "@/lib/mail";

const Body = z.object({ email: z.string().email().max(200), lang: z.string().refine(isLang).optional(), source: z.string().max(60).optional() });

export async function POST(req: Request) {
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: "bad_email" }, { status: 400 });
  if (!hasDb()) {
    // Before the database is connected, each sign-up is mailed to the owners so nobody is lost.
    const owners = (process.env.OWNER_EMAILS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    let sent = false;
    for (const o of owners) sent = (await sendMail(o, `Unchore waitlist: ${b.data.email}`, `<p>${esc(b.data.email)} (${esc(b.data.lang ?? "?")}, ${esc(b.data.source ?? "?")})</p>`, b.data.email)) || sent;
    return sent ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "not_ready" }, { status: 503 });
  }
  await q("insert into waitlist(email, lang, source) values (lower($1), $2, $3) on conflict (email) do nothing", [b.data.email, b.data.lang ?? null, b.data.source ?? null]);
  const n = await q<{ n: number }>("select count(*)::int as n from waitlist");
  return NextResponse.json({ ok: true, position: n[0]?.n ?? 0 });
}
