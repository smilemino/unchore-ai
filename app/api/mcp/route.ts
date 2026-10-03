import { NextResponse } from "next/server";
import { z } from "zod";
import { isResp, requireUser } from "@/lib/api";
import { addServer, refresh, removeServer, servers } from "@/lib/mcp-client";

// Settings → AI → «MCP servers» (lib/mcp-client.ts): list, add (address + optional saved key), read tools again, remove.
// Never returns sign-in values — only whether one is there.
export async function GET() {
  const u = await requireUser();
  if (isResp(u)) return u;
  const rows = await servers(u.id);
  return NextResponse.json(rows.map((r) => ({ id: r.id, slug: r.slug, host: new URL(r.url).host, url: r.url, tools: r.tools.map((t) => t.name), ok: !!r.last_ok_at && !r.last_error, error: r.last_error })));
}

const Add = z.object({ name: z.string().trim().min(1).max(40), url: z.string().trim().min(8).max(500), secret: z.string().trim().max(60).optional() });
export async function POST(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const b = await req.json().catch(() => ({}));
  if (b && typeof b === "object" && "refresh" in b) {
    const row = (await servers(u.id)).find((r) => r.id === String((b as { refresh: unknown }).refresh));
    return row ? NextResponse.json(await refresh(u.id, row)) : NextResponse.json({ ok: false, text: "not found" }, { status: 404 });
  }
  const a = Add.safeParse(b);
  if (!a.success) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  return NextResponse.json(await addServer(u.id, { name: a.data.name, url: a.data.url, secret: a.data.secret || undefined }));
}

export async function DELETE(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const ok = await removeServer(u.id, new URL(req.url).searchParams.get("slug") ?? "");
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}
