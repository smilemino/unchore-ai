import { asLang } from "@/lib/i18n";
import { Suspense } from "react";
import { Chat } from "@/components/Chat";
import { MODELS, type Provider } from "@/lib/ai";
import { creditReady } from "@/lib/credits";
import { computerModel, computersOn, listComputers } from "@/lib/computers";
import { q } from "@/lib/db";
import { currentUser } from "@/lib/session";

export default async function AppHome() {
  const u = (await currentUser())!;
  const keys = await q<{ provider: Provider }>("select provider from user_keys where user_id = $1", [u.id]);
  const me = await q<{ face: string | null; onboarded_at: string | null }>("select face, onboarded_at from users where id = $1", [u.id]);
  // Unchore credit answers too (lib/credits.ts), but only credit they bought — connecting is the first thing a new member does,
  // and the welcome credit pays for the Google voice (owner 2026-10-01).
  const credit = await creditReady(u.id);
  const models = [...keys.map((k) => k.provider), ...(credit ? ["credit" as const] : [])].flatMap((p) => MODELS[p] ?? []).map((m) => ({ id: m.id, label: m.label }));
  // «🖥 <name>»: the member's own connected computers answer like an AI (lib/computers.ts)
  const computers = computersOn(u.email) ? (await listComputers(u.id)).map((c) => ({ id: computerModel(c.id), label: `🖥 ${c.name}` })) : [];
  models.push(...computers);
  return <Suspense><Chat lang={asLang(u.lang)} hasKey={keys.length > 0 || credit || computers.length > 0} models={models} face={me[0]?.face ?? null} onboarded={Boolean(me[0]?.onboarded_at)} defaultModel={u.default_model ?? null} name={u.name ?? null} /></Suspense>;
}
