// Free «website security check» (app/tools/site-check): one GET of a public address, headers read out (lib/free-tools/site-check.ts).
// No sign-in; a small per-address limit so the tool can't be used to hammer a site through us.
import { NextResponse } from "next/server";
import { checkSite } from "@/lib/free-tools/site-check";

const seen = new Map<string, number[]>();
const LIMIT = 10, WINDOW = 10 * 60_000;
function limited(ip: string): boolean {
  const now = Date.now();
  const list = (seen.get(ip) ?? []).filter((t) => now - t < WINDOW);
  if (list.length >= LIMIT) { seen.set(ip, list); return true; }
  list.push(now); seen.set(ip, list);
  if (seen.size > 5000) for (const [key, v] of seen) if (!v.some((t) => now - t < WINDOW)) seen.delete(key);
  return false;
}

export async function GET(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]!.trim() || "?";
  if (limited(ip)) return NextResponse.json({ error: "slow_down" }, { status: 429 });
  const url = new URL(req.url).searchParams.get("url") ?? "";
  const r = await checkSite(url);
  return NextResponse.json(r, { status: "error" in r ? (r.error === "bad_address" ? 400 : 502) : 200, headers: { "cache-control": "no-store" } });
}
