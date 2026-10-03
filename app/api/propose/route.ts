import { asLang } from "@/lib/i18n";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isResp, requireUser } from "@/lib/api";
import { fastModel, providerOf, userKeys } from "@/lib/ai";
import { one } from "@/lib/db";
import { asksBack, judge } from "@/lib/judge";
import { reminderJustSet } from "@/lib/proposal-gate";
import { unlock } from "@/lib/privacy";

const Body = z.object({ messageId: z.string().uuid() });

export async function POST(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  const existing = await one("select id, propose, method, offer, status from proposals where message_id = $1 and user_id = $2", [b.data.messageId, u.id]);
  if (existing) return NextResponse.json(existing);
  // The member's last few messages, oldest first — details («at 9pm», «below 1,400») often came a turn earlier.
  const pair = await one<{ answer: string; asked: string[] | null }>(
    `select m.content as answer, (select json_agg(s.content order by s.created_at) from (select q.content, q.created_at from messages q where q.conversation_id = m.conversation_id and q.role = 'user' and q.created_at <= m.created_at order by q.created_at desc limit 4) s) as asked
     from messages m join conversations c on c.id = m.conversation_id where m.id = $1 and c.user_id = $2 and m.role = 'assistant'`, [b.data.messageId, u.id]);
  if (!pair?.asked?.length) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const question = pair.asked.map((x) => unlock(x)).join("\n");
  pair.answer = unlock(pair.answer);
  // Still asking them something → wait for their answer; the card comes with the next reply (no AI call spent).
  // Or this very answer already set a reminder in the chat (lib/proposal-gate.ts).
  if (asksBack(pair.answer) || await reminderJustSet(u.id, b.data.messageId)) {
    const row = await one("insert into proposals(user_id, message_id, propose, method, offer) values ($1, $2, false, 'X', '') on conflict (message_id) do update set offer = excluded.offer returning id, propose, method, offer, status", [u.id, b.data.messageId]);
    return NextResponse.json(row);
  }
  const keys = await userKeys(u.id);
  const model = fastModel(keys);
  if (!model) return NextResponse.json({ error: "no_key" }, { status: 400 });
  const lang = asLang(u.lang);
  const j = await judge({ model, key: keys[providerOf(model)]!, question, answer: pair.answer, lang }).catch(() => ({ propose: false, method: "X" as const, offer: "" }));
  const row = await one("insert into proposals(user_id, message_id, propose, method, offer) values ($1, $2, $3, $4, $5) on conflict (message_id) do update set offer = excluded.offer returning id, propose, method, offer, status",
    [u.id, b.data.messageId, j.propose, j.method, j.offer]);
  return NextResponse.json(row);
}
