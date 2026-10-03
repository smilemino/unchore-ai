import { NextResponse } from "next/server";
import { z } from "zod";
import { isResp, requireUser } from "@/lib/api";
import { appUrl } from "@/lib/app-url";
import { computersOn, createComputer, listComputers, removeComputer } from "@/lib/computers";

// Settings «Your computers» (lib/computers.ts). On for every member unless UNCHORE_COMPUTERS says owner or off.
export async function GET() {
  const u = await requireUser();
  if (isResp(u)) return u;
  if (!computersOn(u.email)) return NextResponse.json({ available: false, computers: [] });
  return NextResponse.json({ available: true, computers: await listComputers(u.id) });
}

const Body = z.object({ name: z.string().trim().min(1).max(40) });
/** A new computer: the token is only ever in this answer, inside the one command the member pastes on that computer. */
export async function POST(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  if (!computersOn(u.email)) return NextResponse.json({ error: "not_available" }, { status: 404 });
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  const made = await createComputer(u.id, b.data.name);
  if (!made) return NextResponse.json({ error: "too_many" }, { status: 400 });
  const base = appUrl();
  const command = `curl -fsSL ${base}/unchore-computer.mjs -o unchore-computer.mjs && node unchore-computer.mjs --token ${made.token} --server ${base}`;
  return NextResponse.json({ computer: made.row, command });
}

export async function DELETE(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  return NextResponse.json({ ok: await removeComputer(u.id, id).catch(() => false) });
}
