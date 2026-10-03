import { NextResponse } from "next/server";
import { z } from "zod";
import { isResp, requireUser } from "@/lib/api";
import { COMPAT, complete, fastModel, KEY_PROVIDERS, listModels, MODELS, type KeyProvider, type Provider } from "@/lib/ai";
import { skGuesses } from "@/lib/chat-setup";
import { hint, seal } from "@/lib/crypto";
import { q } from "@/lib/db";

// «auto»: a plain «sk-…» key looks the same for ChatGPT, DeepSeek and Kimi — ask each company's model list (free, no answer
// is made) and keep the one that says yes. The member never has to say which company it's from (owner 2026-10-01).
const Body = z.object({ provider: z.enum([...KEY_PROVIDERS, "auto"]), key: z.string().min(10).max(400), test: z.boolean().optional() });

async function whose(key: string): Promise<KeyProvider | null> {
  for (const p of skGuesses(key)) if (await listModels(p, key)) return p;
  return null;
}

export async function POST(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  const key = b.data.key.trim();
  const provider = b.data.provider === "auto" ? await whose(key) : b.data.provider;
  if (!provider) return NextResponse.json({ error: "key_rejected", detail: "no company accepted this key" }, { status: 400 });
  if (b.data.test !== false) {
    const model = fastModel({ [provider]: key } as Partial<Record<Provider, string>>) ?? MODELS[provider][0]!.id;
    try {
      await complete({ model, key, maxTokens: provider in COMPAT ? 20 : 5, system: "Reply with OK.", messages: [{ role: "user", content: "ping" }] });
    } catch (e) {
      return NextResponse.json({ error: "key_rejected", provider, detail: String((e as { detail?: string }).detail ?? (e as Error).message).slice(0, 200) }, { status: 400 });
    }
  }
  await q(
    "insert into user_keys(user_id, provider, enc, hint) values ($1, $2, $3, $4) on conflict (user_id, provider) do update set enc = excluded.enc, hint = excluded.hint, updated_at = now()",
    [u.id, provider, seal(key), hint(key)],
  );
  return NextResponse.json({ ok: true, provider, hint: hint(key) });
}

export async function DELETE(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const p = new URL(req.url).searchParams.get("provider") ?? "";
  await q("delete from user_keys where user_id = $1 and provider = $2", [u.id, p]);
  return NextResponse.json({ ok: true });
}
