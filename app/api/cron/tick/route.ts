import { NextResponse } from "next/server";
import { cronOk } from "@/lib/api";
import { tick } from "@/lib/automation";
import { dailyNotes } from "@/lib/nudge";
import { nightlyStyle } from "@/lib/answer-style";
import { drainQueue } from "@/lib/queue";
import { buildTick } from "@/lib/build";
import { autoDone, autoDueNow } from "@/lib/auto-done";
import { turnSweep } from "@/lib/turn-sweep";
import { hfTick } from "@/lib/higgsfield";
import { nightRetry } from "@/lib/night-retry";
import { jobTick } from "@/lib/bg-jobs";
import { callTick } from "@/lib/call-intake";

export const maxDuration = 300;

export async function GET(req: Request) {
  if (!cronOk(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const t0 = Date.now();
  const ran = await tick();
  // members' nightly look-back — once an hour, for members whose local time is 04:xx (the worker calls this every minute)
  const mm = new Date().getUTCMinutes();   // two chances an hour (the minute timer drifts); a second pass changes nothing — nightlyNudge checks its own dates
  const notes = mm === 5 || mm === 6 ? await dailyNotes(Date.now() + 200_000).catch(() => null) : null;
  // «how to answer me» per member, same local 04:xx hour, after the daily notes (lib/answer-style.ts; once per member per 20 h)
  const style = mm === 5 || mm === 6 ? await nightlyStyle(t0 + 240_000).catch(() => null) : null;
  // «I don't know» answers asked again with the member's own strongest model, same local 04:xx hour (lib/night-retry.ts)
  const retry = mm === 5 || mm === 6 ? await nightRetry(t0 + 260_000).catch(() => null) : null;
  // calls → requests, at members' local 05 · 11 · 17 on their own AI (lib/call-intake.ts)
  const calls = mm === 5 || mm === 6 ? await callTick(t0 + 265_000).catch(() => null) : null;
  const queued = await drainQueue().catch(() => 0);   // waiting messages whose screen was closed (lib/queue.ts)
  const builds = await buildTick().catch(() => null);   // app builds left behind + the owner's daily spend alert (lib/build.ts)
  const jobs = await jobTick().catch(() => null);   // background jobs whose start got lost, or that went quiet (lib/bg-jobs.ts)
  const hf = await hfTick().catch(() => null);   // images/videos being made on members' Higgsfield accounts → «ready» (lib/higgsfield.ts)
  const swept = autoDueNow() ? await turnSweep(t0 + 270_000).catch(() => null) : null;   // «Your turn» second look across chats with the member's own AI, just before the tidy (lib/turn-sweep.ts)
  const tidied = autoDueNow() ? await autoDone().catch(() => 0) : 0;   // chats with nothing left to do → «Done», every 30 min (lib/auto-done.ts)
  return NextResponse.json({ ...ran, ...(notes ? { notes } : {}), ...(style?.checked ? { style } : {}), ...(retry?.members ? { retry } : {}), ...(calls?.members ? { calls } : {}), ...(queued ? { queued } : {}), ...(hf?.done || hf?.failed ? { hf } : {}), ...(jobs?.kicked || jobs?.closed ? { jobs } : {}), ...(tidied ? { tidied } : {}), ...(swept?.let_go ? { swept } : {}), ...(builds?.stuck || builds?.waiting || builds?.alerted ? { builds } : {}) });
}
