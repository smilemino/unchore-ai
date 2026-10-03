import { NextResponse } from "next/server";
import { appUrl } from "@/lib/app-url";
import { asMember } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { finishSignIn, refresh, servers } from "@/lib/mcp-client";

// The way back from an MCP server's «Authorize» page: keep the member's tokens (locked) and read its tools.
export async function GET(req: Request) {
  const base = appUrl(req);
  const u = await currentUser();
  if (!u) return NextResponse.redirect(`${base}/login`);
  const p = new URL(req.url).searchParams;
  const code = p.get("code"), state = p.get("state");
  const back = (q: string) => NextResponse.redirect(`${base}/app/settings?tab=ai&${q}#mcp`);
  if (!code || !state) return back(`mcp_error=${encodeURIComponent(p.get("error_description") ?? p.get("error") ?? "cancelled")}`);
  const slug = await asMember(u.id, () => finishSignIn(u.id, state, code)).catch(() => null);
  if (!slug) return back("mcp_error=sign-in%20failed");
  await asMember(u.id, async () => { const row = (await servers(u.id)).find((r) => r.slug === slug); if (row) await refresh(u.id, row); }).catch(() => null);
  return back(`mcp_ok=${encodeURIComponent(slug)}`);
}
