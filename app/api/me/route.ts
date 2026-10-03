import { NextResponse } from "next/server";
import { isResp, requireUser } from "@/lib/api";
import { q } from "@/lib/db";
import { MODELS, PROVIDERS } from "@/lib/ai";
import { computerModel, computersOn, listComputers } from "@/lib/computers";

export async function GET() {
  const u = await requireUser();
  if (isResp(u)) return u;
  const keys = await q<{ provider: string; hint: string }>("select provider, hint from user_keys where user_id = $1", [u.id]);
  const computers = computersOn(u.email) ? (await listComputers(u.id)).map((c) => ({ id: computerModel(c.id), label: `🖥 ${c.name}`, online: c.online })) : [];
  return NextResponse.json({ user: u, keys, providers: PROVIDERS, models: MODELS, computers });
}
