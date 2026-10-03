import { NextResponse } from "next/server";
import { isResp, requireUser } from "@/lib/api";
import { connection, disconnect } from "@/lib/google-connect";
import { googleOn } from "@/lib/google-env";

// The member's Google connection (lib/google-connect.ts): what is connected, and «Disconnect» (Google's access is taken back too).
export async function GET() {
  const u = await requireUser();
  if (isResp(u)) return u;
  return NextResponse.json({ available: googleOn(), connected: await connection(u.id) });
}
export async function DELETE() {
  const u = await requireUser();
  if (isResp(u)) return u;
  await disconnect(u.id);
  return NextResponse.json({ ok: true });
}
