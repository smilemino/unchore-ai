import { NextResponse } from "next/server";
import { isResp, requireUser } from "@/lib/api";
import { one, q } from "@/lib/db";
import { IMPORT_MAX_BYTES, newChats, parseExport, readExportFile } from "@/lib/importer";
import { lock, unlockBytes } from "@/lib/privacy";

export const maxDuration = 120;

// Upload conversations.json — or the export ZIP as downloaded — from ChatGPT or Claude, 300 new chats per upload.
// Up to 4 MB as one file; bigger (up to 50 MB) goes up in pieces first (app/api/files/upload ① and ②), then POST {upload: id}
// puts them together here. Chats already brought over (same export id — db/migrations/046) are skipped, never doubled.
export async function POST(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  let buf: Uint8Array;
  if ((req.headers.get("content-type") ?? "").includes("application/json")) {
    const id = String(((await req.json().catch(() => ({}))) as { upload?: unknown }).upload ?? "");
    const up = /^[0-9a-f-]{36}$/i.test(id) ? await one<{ size: number; parts: number }>("select size, parts from uploads where id = $1 and user_id = $2", [id, u.id]) : null;
    if (!up) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (up.size > IMPORT_MAX_BYTES) return NextResponse.json({ error: "too_big" }, { status: 413 });
    const pieces = await q<{ idx: number; data: Buffer }>("select idx, data from upload_parts where upload_id = $1 and user_id = $2 order by idx", [id, u.id]);
    const whole = Buffer.concat(pieces.map((p) => unlockBytes(p.data)));
    if (pieces.length !== up.parts || pieces.some((p, i) => p.idx !== i) || whole.length !== up.size) return NextResponse.json({ error: "incomplete" }, { status: 409 });
    await q("delete from upload_parts where upload_id = $1", [id]);
    await q("delete from uploads where id = $1", [id]);
    buf = new Uint8Array(whole);
  } else {
    const form = await req.formData().catch(() => null);
    const f = form?.get("file");
    if (!(f instanceof File)) return NextResponse.json({ error: "no_file" }, { status: 400 });
    if (f.size > 4 * 1024 * 1024) return NextResponse.json({ error: "too_big" }, { status: 413 });
    buf = new Uint8Array(await f.arrayBuffer());
  }
  const read = readExportFile(buf);
  if ("error" in read) return NextResponse.json({ error: read.error }, { status: read.status });
  const chats = parseExport(read.json);
  const ids = chats.flatMap((c) => (c.uuid ? [c.uuid] : []));
  const known = ids.length ? await q<{ import_uuid: string }>("select import_uuid from conversations where user_id = $1 and import_uuid = any($2::text[])", [u.id, ids]) : [];
  const { pick, skipped, more } = newChats(chats, new Set(known.map((r) => r.import_uuid)), 300);
  let n = 0, raced = 0;
  for (const c of pick) {
    const conv = await one<{ id: string }>("insert into conversations(user_id, title, titled, created_at, updated_at, import_uuid) values ($1, $2, true, coalesce($3::timestamptz, now()), coalesce($3::timestamptz, now()), $4) on conflict (user_id, import_uuid) where import_uuid is not null do nothing returning id",
      [u.id, lock(`↩ ${c.title}`.slice(0, 120)), c.created, c.uuid]);
    if (!conv) { raced++; continue; }   // the same file sent twice at once — the other upload has it
    for (const m of c.messages.slice(0, 500)) await q("insert into messages(conversation_id, role, content) values ($1, $2, $3)", [conv.id, m.role, lock(m.content.slice(0, 40000))]);
    n++;
  }
  return NextResponse.json({ imported: n, skipped: skipped + raced, more });
}
