import { NextResponse } from "next/server";
import { isResp, requireUser } from "@/lib/api";
import { one, q } from "@/lib/db";
import { unlockBytes } from "@/lib/privacy";
import { bigStream } from "@/lib/big-files";

export const maxDuration = 300;   // a whole file over 50 MB (no byte range) streams for a while

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const { id } = await ctx.params;
  const f = await one<{ name: string; mime: string; size: number; data: Buffer; parts_of: string | null }>("select name, mime, size, case when parts_of is null then data end as data, parts_of from files where id = $1 and user_id = $2", [id, u.id]);
  if (!f) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const inline = new URL(req.url).searchParams.get("view") === "1" && /^(image\/|video\/|audio\/|application\/pdf|text\/plain)/.test(f.mime);
  // Streamed in 1 MB pieces: Vercel caps a plain response at 4.5 MB, a streamed one isn't (files over 4 MB — app/api/files/upload).
  const all = f.parts_of ? null : new Uint8Array(unlockBytes(f.data));
  const len = all ? all.length : f.size;   // a file over 50 MB is read piece by piece (lib/big-files.ts), never whole
  // Videos play from a byte range (Safari on iPhone asks for «bytes=0-1» first and won't play without a 206 answer).
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  const from = range ? (range[1] ? Number(range[1]) : Math.max(0, len - Number(range[2] || 0))) : 0;
  const to = range ? (range[1] && range[2] ? Math.min(Number(range[2]), len - 1) : len - 1) : len - 1;
  if (range && (from > to || from >= len)) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${len}` } });
  const count = to - from + 1;
  let at = 0;
  const bytes = all ? all.subarray(from, to + 1) : null;
  const body = !bytes ? bigStream(f.parts_of!, from, to) : bytes.length <= 4_000_000 ? bytes : new ReadableStream<Uint8Array>({ pull(c) { if (at >= bytes.length) { c.close(); return; } c.enqueue(bytes.subarray(at, at + 1_048_576)); at += 1_048_576; } });
  return new Response(body, { status: range ? 206 : 200, headers: {
    ...(range ? { "Content-Range": `bytes ${from}-${to}/${len}` } : {}), "Accept-Ranges": "bytes",
    "Content-Length": String(count),
    "Content-Type": f.mime, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
  } });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const { id } = await ctx.params;
  const gone = await one<{ parts_of: string | null }>("delete from files where id = $1 and user_id = $2 returning parts_of", [id, u.id]);
  if (gone?.parts_of) await q("delete from upload_parts where upload_id = $1 and user_id = $2", [gone.parts_of, u.id]);   // a big file's pieces go with it
  return NextResponse.json({ ok: true });
}
