import { NextResponse } from "next/server";
import { z } from "zod";
import { isResp, requireUser } from "@/lib/api";
import { appUrl } from "@/lib/app-url";
import { createHook, deleteHook, hookUrl, listHooks, rekeyHook, updateHook } from "@/lib/inbox-hooks";

// Settings → «Alerts in» (lib/inbox-hooks.ts). The address with its key is returned only when made or given a new key.
export async function GET(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const base = appUrl(req);
  return NextResponse.json((await listHooks(u.id)).map((h) => ({ ...h, url: hookUrl(base, h.id) })));
}

const Body = z.discriminatedUnion("step", [
  z.object({ step: z.literal("create"), name: z.string().max(200), conversation_id: z.string().max(40).nullable().optional() }),
  z.object({ step: z.literal("rekey"), id: z.string().max(40) }),
  z.object({ step: z.literal("update"), id: z.string().max(40), enabled: z.boolean().optional(), per_hour: z.number().int().optional(), conversation_id: z.string().max(40).nullable().optional() }),
]);
export async function POST(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  const d = b.data, base = appUrl(req);
  if (d.step === "create") {
    const r = await createHook(u.id, d.name, d.conversation_id ?? null);
    return r ? NextResponse.json({ ok: true, url: hookUrl(base, r.row.id, r.key) }) : NextResponse.json({ error: "not_made" }, { status: 400 });
  }
  if (d.step === "rekey") {
    const key = await rekeyHook(u.id, d.id);
    return key ? NextResponse.json({ ok: true, url: hookUrl(base, d.id, key) }) : NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const ok = await updateHook(u.id, d.id, { enabled: d.enabled, per_hour: d.per_hour, conversation_id: d.conversation_id });
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "bad_input" }, { status: 400 });
}

export async function DELETE(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const ok = await deleteHook(u.id, new URL(req.url).searchParams.get("id") ?? "");
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}
