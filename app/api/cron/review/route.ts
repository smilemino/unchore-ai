import { NextResponse } from "next/server";
import { cronOk } from "@/lib/api";
import { nightlyReview } from "@/lib/nightly-review";

export const maxDuration = 60;

// Yesterday's answers that went wrong, from the agreed improvement copies (lib/nightly-review.ts) — for our nightly improvement run only.
export async function GET(req: Request) {
  if (!cronOk(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const h = Math.min(168, Math.max(1, Number(new URL(req.url).searchParams.get("hours")) || 24));
  const all = new URL(req.url).searchParams.get("all") === "1";
  return NextResponse.json(await nightlyReview(h, all ? 200 : 60, all));
}
