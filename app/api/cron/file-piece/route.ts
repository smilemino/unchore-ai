import { NextResponse } from "next/server";
import { cronOk } from "@/lib/api";
import { bigPiece } from "@/lib/big-files";

// One piece of a member's file over 50 MB, for the worker transcribing it (worker/media.mjs piecesTo) — it reads the pieces in
// order, so neither side holds the whole file in a function. Same secret as every worker ↔ app call.
export async function GET(req: Request) {
  if (!cronOk(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const id = sp.get("id") ?? "", i = Number(sp.get("i"));
  if (!/^[0-9a-f-]{36}$/i.test(id) || !Number.isInteger(i) || i < 0) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  const p = await bigPiece(id, i);
  if (!p) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return new Response(new Uint8Array(p), { headers: { "Content-Type": "application/octet-stream", "Cache-Control": "no-store" } });
}
