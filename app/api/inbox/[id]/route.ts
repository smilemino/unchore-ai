import { NextResponse } from "next/server";
import { receive } from "@/lib/inbox-hooks";

export const dynamic = "force-dynamic";

// «Alerts in» (lib/inbox-hooks.ts): a member's own outside service sends a message here; it lands in the chat they picked.
// The key comes as ?key=…, or the header x-inbox-key, or «Authorization: Bearer …» — whichever the service can set.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const bearer = /^Bearer\s+(\S+)\s*$/.exec(req.headers.get("authorization") ?? "")?.[1] ?? null;
  const key = req.headers.get("x-inbox-key") ?? bearer ?? new URL(req.url).searchParams.get("key");
  const r = await receive(id, key, await req.text().catch(() => ""), req.headers.get("content-type"));
  const res = NextResponse.json(r.status === 200 ? { ok: true } : { error: r.error }, { status: r.status });
  if (r.status === 429) res.headers.set("retry-after", "3600");
  return res;
}
