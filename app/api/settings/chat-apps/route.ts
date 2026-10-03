import { NextResponse } from "next/server";
import { z } from "zod";
import { isResp, requireUser } from "@/lib/api";
import { appUrl } from "@/lib/app-url";
import { discordSave, disconnect, slackSave, slackStart, status } from "@/lib/chat-apps";

// Settings → AI → Slack / Discord (lib/chat-apps.ts). Never returns the saved values.
export async function GET() {
  const u = await requireUser();
  if (isResp(u)) return u;
  return NextResponse.json(await status(u.id));
}

const Body = z.discriminatedUnion("step", [
  z.object({ step: z.literal("slack-start") }),
  z.object({ step: z.literal("slack-save"), token: z.string().max(300), signing: z.string().max(100) }),
  z.object({ step: z.literal("discord-save"), appId: z.string().max(40), publicKey: z.string().max(100), token: z.string().max(200) }),
]);
export async function POST(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  const base = appUrl(req), d = b.data;
  if (d.step === "slack-start") return NextResponse.json({ ok: true, url: await slackStart(u.id, base) });
  if (d.step === "slack-save") return NextResponse.json(await slackSave(u.id, d.token, d.signing));
  return NextResponse.json(await discordSave(u.id, d, base));
}

export async function DELETE(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const k = new URL(req.url).searchParams.get("kind");
  if (k !== "slack" && k !== "discord") return NextResponse.json({ error: "bad_input" }, { status: 400 });
  await disconnect(u.id, k);
  return NextResponse.json({ ok: true });
}
