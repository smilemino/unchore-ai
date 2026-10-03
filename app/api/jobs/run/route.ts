import { NextResponse } from "next/server";
import { cronOk } from "@/lib/api";
import { runJob } from "@/lib/bg-jobs";

// One background job (lib/bg-jobs.ts), started by the «jobs» tool right away and by the minute timer for any start that got lost.
// Each job is its own run, so several run at the same time.
export const maxDuration = 800;

export async function POST(req: Request) {
  if (!cronOk(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "bad_id" }, { status: 400 });
  const status = await runJob(id).catch((e) => { console.warn(`job ${id}: ${(e as Error).message}`); return "failed"; });
  return NextResponse.json({ status });
}
