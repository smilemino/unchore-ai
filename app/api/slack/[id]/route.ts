import { after, NextResponse } from "next/server";
import { slackIncoming } from "@/lib/chat-apps";

export const maxDuration = 800;

// Events from a member's own Slack app (lib/chat-apps.ts). Slack wants an answer within 3 seconds, so the chat answer is
// written after this returns (and posted into Slack by itself).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const r = await slackIncoming(id, req.headers, await req.text());
  if (r.after) after(() => r.after!().catch((e) => console.warn(`slack: ${(e as Error).message}`)));
  return NextResponse.json(r.json, { status: r.status });
}
