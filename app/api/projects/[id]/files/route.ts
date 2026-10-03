import { decodeText } from "@/lib/text-decode";
import { maskCardsInFile } from "@/lib/card-mask";
import { NextResponse } from "next/server";
import { isResp, requireUser } from "@/lib/api";
import { one, q } from "@/lib/db";
import { MAX_UPLOAD, isTexty } from "@/lib/uploads";
import { lockBytes, lockOrNull } from "@/lib/privacy";
import { MAX_PROJECT_FILES } from "@/lib/projects";

// Project files (ported from AI Soul «프로젝트 파일»): every chat in the project reads them (lib/turn.ts projectFilesBlock).
async function own(id: string, uid: string) { return one("select 1 from projects where id = $1 and user_id = $2", [id, uid]); }

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const { id } = await ctx.params;
  if (!(await own(id, u.id))) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(await q("select id, name, mime, size, (text_extract is not null) as readable, created_at from files where project_id = $1 and user_id = $2 order by created_at", [id, u.id]));
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const { id } = await ctx.params;
  if (!(await own(id, u.id))) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const form = await req.formData().catch(() => null);
  const f = form?.get("file");
  if (!(f instanceof File)) return NextResponse.json({ error: "no_file" }, { status: 400 });
  if (f.size > MAX_UPLOAD) return NextResponse.json({ error: "too_big", max: MAX_UPLOAD }, { status: 413 });
  const n = await one<{ n: number }>("select count(*)::int as n from files where project_id = $1", [id]);
  if ((n?.n ?? 0) >= MAX_PROJECT_FILES) return NextResponse.json({ error: "too_many", max: MAX_PROJECT_FILES }, { status: 400 });
  const buf = maskCardsInFile(Buffer.from(await f.arrayBuffer())).data;   // card numbers masked on arrival (lib/card-mask.ts)
  const mime = f.type || "application/octet-stream";
  const text = isTexty(mime, f.name) ? decodeText(buf) : null;
  const row = await one<{ id: string }>("insert into files(user_id, project_id, name, mime, size, data, text_extract) values ($1,$2,$3,$4,$5,$6,$7) returning id",
    [u.id, id, f.name.slice(0, 200), mime, buf.length, lockBytes(buf), lockOrNull(text)]);
  return NextResponse.json({ id: row!.id, name: f.name, mime, size: buf.length, readable: text !== null });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const { id } = await ctx.params;
  const f = new URL(req.url).searchParams.get("file") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(f)) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  await q("delete from files where id = $1 and project_id = $2 and user_id = $3 and message_id is null", [f, id, u.id]);
  return NextResponse.json({ ok: true });
}
