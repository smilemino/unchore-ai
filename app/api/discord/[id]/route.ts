import { after, NextResponse } from "next/server";
import { discordIncoming } from "@/lib/chat-apps";

export const maxDuration = 800;

// /ask from a member's own Discord app (lib/chat-apps.ts). Discord wants an answer within 3 seconds: «coming» first (only they
// see it), then the chat answer replaces it.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const r = await discordIncoming(id, req.headers, await req.text());
  if (r.after) after(() => r.after!().catch((e) => console.warn(`discord: ${(e as Error).message}`)));
  return NextResponse.json(r.json, { status: r.status });
}
