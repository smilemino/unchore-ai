import { NextResponse } from "next/server";
import { isResp, requireUser } from "@/lib/api";
import { chatSummary } from "@/lib/chat-summary";

// The long-chat summary for «View summary» (components/ContextNote.tsx) — read only, the member's own chat only.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const s = await chatSummary(id, u.id);
  if (!s) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(s);
}
