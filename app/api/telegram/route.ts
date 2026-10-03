import { after, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { handleUpdate } from "@/lib/telegram";

export const maxDuration = 300;

// Telegram's webhook (lib/telegram.ts). Telegram sends our secret in a header; anything else is refused.
// Answer Telegram at once and do the turn after, so a slow answer is never sent twice.
export async function POST(req: Request) {
  const want = process.env.TELEGRAM_WEBHOOK_SECRET ?? "", got = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!want || want.length !== got.length || !timingSafeEqual(Buffer.from(want), Buffer.from(got))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const update = await req.json().catch(() => null);
  if (update) after(() => handleUpdate(update).catch((e) => console.warn(`telegram update failed: ${(e as Error).message}`)));
  return NextResponse.json({ ok: true });
}
