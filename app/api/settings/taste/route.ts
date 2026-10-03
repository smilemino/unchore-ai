import { NextResponse } from "next/server";
import { isResp, requireUser } from "@/lib/api";
import { q } from "@/lib/db";
import { leanings, loadVotes } from "@/lib/taste";

// Taste memory (lib/taste.ts): what they lean yes/no to, and «forget my taste».
export async function GET() {
  const u = await requireUser();
  if (isResp(u)) return u;
  const votes = await loadVotes(u.id);
  return NextResponse.json({ votes: votes.length, leanings: leanings(votes) });
}
export async function DELETE() {
  const u = await requireUser();
  if (isResp(u)) return u;
  await q("delete from taste_votes where user_id = $1", [u.id]);
  return NextResponse.json({ ok: true });
}
