import { NextResponse } from "next/server";
import { cronOk } from "@/lib/api";
import { runNextBuild } from "@/lib/build";

// Runs queued app builds (lib/build.ts). Started by the chat route right after an answer that asked for a build, and by the
// minute timer for any left behind. One build takes one to five minutes: AI writing, sandbox check, Vercel deploy.
export const maxDuration = 800;

export async function POST(req: Request) {
  if (!cronOk(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const ran: string[] = [];
  const until = Date.now() + 8 * 60_000;
  while (Date.now() < until) {
    const id = await runNextBuild().catch((e) => { console.warn(`build runner: ${(e as Error).message}`); return null; });
    if (!id) break;
    ran.push(id);
  }
  return NextResponse.json({ ran: ran.length });
}
