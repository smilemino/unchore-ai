import { NextResponse } from "next/server";
import { isResp, requireUser } from "@/lib/api";
import { q } from "@/lib/db";
import { unlock } from "@/lib/privacy";

// Earlier versions of «My instructions» (lib/rules-history.ts). Putting one back is a normal save, which keeps the current one.
export async function GET() {
  const u = await requireUser();
  if (isResp(u)) return u;
  const rows = await q<{ id: string; text: string; created_at: string }>("select id, text, created_at from rules_history where user_id = $1 order by created_at desc limit 20", [u.id]);
  return NextResponse.json(rows.map((r) => ({ ...r, text: unlock(r.text) })));
}
