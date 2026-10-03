import { NextResponse } from "next/server";
import { isResp, requireUser } from "@/lib/api";
import { z } from "zod";
import { continueIn, linkStatus, newLinkCode, telegramOn, unlink } from "@/lib/telegram";

// Settings → Telegram (lib/telegram.ts): GET status, POST a one-time link, PUT {conversationId} = continue that chat in Telegram, DELETE disconnect.
export async function GET() {
  const u = await requireUser();
  if (isResp(u)) return u;
  if (!telegramOn()) return NextResponse.json({ available: false });
  return NextResponse.json({ available: true, ...(await linkStatus(u.id)) });
}

export async function POST() {
  const u = await requireUser();
  if (isResp(u)) return u;
  if (!telegramOn()) return NextResponse.json({ error: "off" }, { status: 404 });
  return NextResponse.json(await newLinkCode(u.id));
}

export async function PUT(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const b = z.object({ conversationId: z.string().uuid() }).safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  if (!telegramOn() || !(await continueIn(u.id, b.data.conversationId))) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const u = await requireUser();
  if (isResp(u)) return u;
  await unlink(u.id);
  return NextResponse.json({ ok: true });
}
