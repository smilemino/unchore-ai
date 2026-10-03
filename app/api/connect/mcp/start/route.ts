import { NextResponse } from "next/server";
import { appUrl } from "@/lib/app-url";
import { asMember } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { startSignIn } from "@/lib/mcp-client";

// «Sign in» for an MCP server the member connected (lib/mcp-client.ts): to that service's own «Authorize» page and back.
export async function GET(req: Request) {
  const base = appUrl(req);
  const u = await currentUser();
  if (!u) return NextResponse.redirect(`${base}/login`);
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.redirect(`${base}/app/settings?tab=ai#mcp`);
  try {
    const go = await asMember(u.id, () => startSignIn(u.id, id, `${base}/api/connect/mcp/callback`));
    return NextResponse.redirect(go);
  } catch (e) {
    return NextResponse.redirect(`${base}/app/settings?tab=ai&mcp_error=${encodeURIComponent((e as Error).message.slice(0, 200))}#mcp`);
  }
}
