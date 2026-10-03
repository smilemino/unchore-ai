import { NextResponse } from "next/server";
import { hasDb, q } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  let db = "off";
  if (hasDb()) db = await q("select 1").then(() => "ok").catch(() => "down");
  return NextResponse.json({ ok: db !== "down", db, version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev" });
}
