import { NextResponse } from "next/server";
import { z } from "zod";
import { isResp, requireUser } from "@/lib/api";
import { one, q } from "@/lib/db";
import { lock, unlock } from "@/lib/privacy";
import { QUEUE_MAX } from "@/lib/queue";

// The chat's waiting messages (lib/queue.ts): list, add, change (text / held), take (DELETE returns whether this caller got it —
// the screen and the minute timer never send the same one twice).
export async function GET(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const c = new URL(req.url).searchParams.get("c") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(c)) return NextResponse.json([]);
  const rows = await q<{ id: string; text: string; file_ids: string[]; held: boolean }>("select id, text, file_ids, held from chat_queue where conversation_id = $1 and user_id = $2 order by created_at", [c, u.id]);
  const files = rows.some((r) => r.file_ids.length) ? await q<{ id: string; name: string; mime: string; size: number }>("select id, name, mime, size from files where user_id = $1 and id = any($2::uuid[])", [u.id, rows.flatMap((r) => r.file_ids)]) : [];
  return NextResponse.json(rows.map((r) => ({ id: r.id, text: unlock(r.text), held: r.held, files: r.file_ids.map((f) => files.find((x) => x.id === f)).filter(Boolean) })));
}

const Add = z.object({ conversationId: z.string().uuid(), text: z.string().min(1).max(40000), fileIds: z.array(z.string().uuid()).max(20).optional() });
export async function POST(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const b = Add.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  const c = await one<{ n: number }>("select (select count(*)::int from chat_queue where conversation_id = c.id) as n from conversations c where c.id = $1 and c.user_id = $2", [b.data.conversationId, u.id]);
  if (!c) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (c.n >= QUEUE_MAX) return NextResponse.json({ error: "too_many", max: QUEUE_MAX }, { status: 400 });
  const row = await one<{ id: string }>("insert into chat_queue(user_id, conversation_id, text, file_ids) values ($1, $2, $3, $4) returning id", [u.id, b.data.conversationId, lock(b.data.text), b.data.fileIds ?? []]);
  return NextResponse.json({ id: row!.id });
}

const Patch = z.object({ text: z.string().min(1).max(40000).optional(), held: z.boolean().optional() });
export async function PATCH(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const b = Patch.safeParse(await req.json().catch(() => ({})));
  if (!b.success || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  await q("update chat_queue set text = coalesce($3, text), held = coalesce($4, held) where id = $1 and user_id = $2", [id, u.id, b.data.text ? lock(b.data.text) : null, b.data.held ?? null]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  const gone = await q("delete from chat_queue where id = $1 and user_id = $2 returning 1", [id, u.id]);
  return NextResponse.json({ taken: gone.length > 0 });
}
