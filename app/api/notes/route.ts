import { NextResponse } from "next/server";
import { isResp, requireUser } from "@/lib/api";
import { loadNotes } from "@/lib/notes";

// «My notes» (lib/notes.ts): the member's notebook, newest change first.
export async function GET() {
  const u = await requireUser();
  if (isResp(u)) return u;
  return NextResponse.json(await loadNotes(u.id, 500));
}
