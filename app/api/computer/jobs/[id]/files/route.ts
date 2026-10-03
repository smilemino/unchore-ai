import { NextResponse } from "next/server";
import { asMember } from "@/lib/db";
import { MADE_MAX, addMadeFile, computerFromToken, jobFile } from "@/lib/computers";

// The member's computer and a job's files: GET ?f=<id> fetches a file the member attached to the question,
// POST ?name=<file name> (raw bytes) sends back a file it made — it shows in the chat with the answer.
const ID = /^[0-9a-f-]{36}$/i;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const c = await computerFromToken(req.headers.get("authorization"));
  if (!c) return NextResponse.json({ error: "unknown_computer" }, { status: 401 });
  const { id } = await ctx.params;
  const f = new URL(req.url).searchParams.get("f") ?? "";
  if (!ID.test(id) || !ID.test(f)) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  const file = await asMember(c.user_id, () => jobFile(c.id, id, f));
  if (!file) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return new Response(new Uint8Array(file.data), { headers: { "Content-Type": file.mime, "Content-Length": String(file.data.length), "Cache-Control": "no-store" } });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const c = await computerFromToken(req.headers.get("authorization"));
  if (!c) return NextResponse.json({ error: "unknown_computer" }, { status: 401 });
  const { id } = await ctx.params;
  const name = (new URL(req.url).searchParams.get("name") ?? "").trim();
  if (!ID.test(id) || !name) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  if (Number(req.headers.get("content-length") ?? 0) > MADE_MAX) return NextResponse.json({ error: "too_big", max: MADE_MAX }, { status: 413 });
  const data = Buffer.from(await req.arrayBuffer());
  if (!data.length || data.length > MADE_MAX) return NextResponse.json({ error: data.length ? "too_big" : "empty", max: MADE_MAX }, { status: 413 });
  const r = await asMember(c.user_id, () => addMadeFile(c.id, id, name, data));
  if (r === "full") return NextResponse.json({ error: "too_many" }, { status: 400 });
  if (!r) return NextResponse.json({ error: "not_running" }, { status: 409 });
  return NextResponse.json({ ok: true, id: r.id });
}
