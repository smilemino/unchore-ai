import { NextResponse } from "next/server";
import { isResp, requireUser } from "@/lib/api";
import { q } from "@/lib/db";
import { unlock } from "@/lib/privacy";

// Memory history (lib/memory-log.ts): the latest 100 changes, newest first.
export async function GET() {
  const u = await requireUser();
  if (isResp(u)) return u;
  const rows = await q<{ id: string; action: string; text: string; by_ai: boolean; conversation_id: string | null; created_at: string }>(
    "select id, action, text, by_ai, conversation_id, created_at from memory_log where user_id = $1 order by created_at desc limit 100", [u.id]);
  return NextResponse.json(rows.map((r) => ({ ...r, text: unlock(r.text) })));
}
