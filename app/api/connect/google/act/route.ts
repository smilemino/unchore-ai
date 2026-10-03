import { NextResponse } from "next/server";
import { z } from "zod";
import { isResp, requireUser } from "@/lib/api";
import { one, q } from "@/lib/db";
import { unlock } from "@/lib/privacy";
import { readGoogleActions } from "@/lib/google-act";
import { calendarAdd, gmailSend, GoogleError } from "@/lib/google-api";

// The member pressed «Yes» on a Google card: run that one proposal from that answer, once.
const Body = z.object({ messageId: z.string().uuid(), i: z.number().int().min(0).max(20) });
export async function POST(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  const m = await one<{ content: string }>("select m.content from messages m join conversations c on c.id = m.conversation_id where m.id = $1 and c.user_id = $2 and m.role = 'assistant'", [b.data.messageId, u.id]);
  const act = m ? readGoogleActions(unlock(m.content))[b.data.i] : undefined;
  if (!act) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const claimed = await q("insert into google_actions(user_id, message_id, idx) values ($1, $2, $3) on conflict do nothing returning 1", [u.id, b.data.messageId, b.data.i]);
  if (!claimed.length) return NextResponse.json({ already: true });
  try {
    const result = act.do === "calendar.add" ? await calendarAdd(u.id, { title: act.title, start: act.start, end: act.end, where: act.where, note: act.note, tz: u.tz })
      : await gmailSend(u.id, { to: act.to, subject: act.subject, body: act.body });
    await q("update google_actions set result = $3 where message_id = $1 and idx = $2", [b.data.messageId, b.data.i, result.slice(0, 500)]);
    return NextResponse.json({ ok: true, link: act.do === "calendar.add" ? result : null });
  } catch (e) {
    await q("delete from google_actions where message_id = $1 and idx = $2", [b.data.messageId, b.data.i]);   // not done → the card can be pressed again
    return NextResponse.json({ error: e instanceof GoogleError ? e.why : "failed" }, { status: 502 });
  }
}
