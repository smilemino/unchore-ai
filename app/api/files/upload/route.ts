import { extractText } from "@/lib/extract";
import { maskCardsInFile } from "@/lib/card-mask";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isResp, requireUser } from "@/lib/api";
import { one, q } from "@/lib/db";
import { MAX_BIG_UPLOAD, MAX_PER_CHAT, PART_BYTES } from "@/lib/uploads";
import { lockBytes, lockOrNull, markGoogleChat, unlockBytes } from "@/lib/privacy";
import { bigRoom, isBig, piecesHave } from "@/lib/big-files";
import { pieceLen } from "@/lib/upload-limits";

export const maxDuration = 60;

// Files over 4 MB (db/migrations/013): ① POST {name, mime, size} → an upload id and the piece size ② PUT ?id&i one piece
// (raw bytes, kept locked) ③ POST ?id&done=1 → put together, card numbers masked, one «files» row like any other attachment.
// Over 50 MB (up to 500 MB): the pieces stay where they are and the row points at them (lib/big-files.ts). GET ?id → pieces already
// here, so an upload cut off goes on from there.
const Start = z.object({ name: z.string().min(1).max(200), mime: z.string().max(200), size: z.number().int().min(1).max(MAX_BIG_UPLOAD), conversationId: z.string().uuid().nullable().optional(), source: z.literal("google").optional() });

export async function POST(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const sp = new URL(req.url).searchParams;
  const id = sp.get("id");
  if (!id) {
    const b = Start.safeParse(await req.json().catch(() => ({})));
    if (!b.success) return NextResponse.json({ error: "too_big", max: MAX_BIG_UPLOAD }, { status: 413 });
    const conv = b.data.conversationId ?? null;
    if (conv) {
      const c = await one<{ n: number }>("select (select count(*)::int from files where conversation_id = c.id) as n from conversations c where c.id = $1 and c.user_id = $2", [conv, u.id]);
      if (!c) return NextResponse.json({ error: "not_found" }, { status: 404 });
      if (c.n >= MAX_PER_CHAT) return NextResponse.json({ error: "too_many", max: MAX_PER_CHAT }, { status: 400 });
    }
    const room = await bigRoom(u.id, b.data.size);
    if (!room.ok) return NextResponse.json({ error: "big_quota", used: room.used, max: room.max }, { status: 413 });
    const parts = Math.ceil(b.data.size / PART_BYTES);
    const row = await one<{ id: string }>("insert into uploads(user_id, name, mime, size, parts, conversation_id, from_google) values ($1, $2, $3, $4, $5, $6, $7) returning id",
      [u.id, b.data.name, b.data.mime || "application/octet-stream", b.data.size, parts, conv, b.data.source === "google"]);
    return NextResponse.json({ id: row!.id, partBytes: PART_BYTES, parts });
  }
  if (sp.get("done") !== "1") return NextResponse.json({ error: "bad_input" }, { status: 400 });
  const up = await one<{ name: string; mime: string; size: number; parts: number; conversation_id: string | null; from_google: boolean }>("select name, mime, size, parts, conversation_id, from_google from uploads where id = $1 and user_id = $2", [id, u.id]);
  if (!up) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (isBig(up.size)) {   // pieces stay; only their numbers are checked (PUT took each at its exact length)
    const have = await piecesHave(id, u.id);
    if (have.length !== up.parts || have.some((x, i) => x !== i)) return NextResponse.json({ error: "incomplete", have }, { status: 409 });
    const room = await bigRoom(u.id, up.size);
    if (!room.ok) return NextResponse.json({ error: "big_quota", used: room.used, max: room.max }, { status: 413 });
    const big = await one<{ id: string }>("insert into files(user_id, conversation_id, name, mime, size, data, from_google, parts_of) values ($1,$2,$3,$4,$5,''::bytea,$6,$7) returning id",
      [u.id, up.conversation_id, up.name, up.mime, up.size, up.from_google, id]);
    if (up.from_google && up.conversation_id) await markGoogleChat(up.conversation_id);
    await q("delete from uploads where id = $1", [id]);
    return NextResponse.json({ id: big!.id, name: up.name, mime: up.mime, size: up.size });
  }
  const pieces = await q<{ idx: number; data: Buffer }>("select idx, data from upload_parts where upload_id = $1 and user_id = $2 order by idx", [id, u.id]);
  const buf0 = Buffer.concat(pieces.map((p) => unlockBytes(p.data)));
  if (pieces.length !== up.parts || pieces.some((p, i) => p.idx !== i) || buf0.length !== up.size) return NextResponse.json({ error: "incomplete", have: pieces.map((p) => p.idx) }, { status: 409 });
  const buf = maskCardsInFile(buf0).data;   // card numbers masked on arrival (lib/card-mask.ts), same as small files
  const text = await extractText(up.name, up.mime, buf);   // text · PDF · Excel/Word/PowerPoint (lib/extract.ts)
  const row = await one<{ id: string }>("insert into files(user_id, conversation_id, name, mime, size, data, text_extract, from_google) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id",
    [u.id, up.conversation_id, up.name, up.mime, buf.length, lockBytes(buf), lockOrNull(text ? text.slice(0, 2_000_000) : null), up.from_google]);
  if (up.from_google && up.conversation_id) await markGoogleChat(up.conversation_id);
  await q("delete from upload_parts where upload_id = $1", [id]);
  await q("delete from uploads where id = $1", [id]);
  return NextResponse.json({ id: row!.id, name: up.name, mime: up.mime, size: buf.length });
}

export async function PUT(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const sp = new URL(req.url).searchParams;
  const id = sp.get("id") ?? "", i = Number(sp.get("i"));
  const up = /^[0-9a-f-]{36}$/i.test(id) ? await one<{ parts: number; size: number }>("select parts, size from uploads where id = $1 and user_id = $2", [id, u.id]) : null;
  if (!up || !Number.isInteger(i) || i < 0 || i >= up.parts) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  const data = Buffer.from(await req.arrayBuffer());
  if (data.length !== pieceLen(up.size, i)) return NextResponse.json({ error: "bad_piece" }, { status: 413 });
  await q("insert into upload_parts(upload_id, user_id, idx, data) values ($1, $2, $3, $4) on conflict (upload_id, idx) do update set data = excluded.data", [id, u.id, i, lockBytes(data)]);
  return NextResponse.json({ ok: true });
}

/** ?id → the pieces already here (an upload cut off goes on from there instead of from the start). */
export async function GET(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const up = /^[0-9a-f-]{36}$/i.test(id) ? await one<{ parts: number }>("select parts from uploads where id = $1 and user_id = $2", [id, u.id]) : null;
  if (!up) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ parts: up.parts, have: await piecesHave(id, u.id) });
}
