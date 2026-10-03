// Free tool «what AI costs a month» (benchmark 2026-10-01, calculator type · «be first on the day prices change»):
// live prices from OpenRouter's public model list (no key; kept a day), the newest two models of each big AI company.
// Every price shows where it came from — Unchore never shows a number without its source.
export type Model = { id: string; name: string; inPerM: number; outPerM: number; created: number };

export const SOURCE_URL = "https://openrouter.ai/api/v1/models";
const MAKERS = ["anthropic", "openai", "google", "x-ai", "deepseek", "meta-llama", "mistralai", "qwen", "z-ai", "moonshotai"];

type Raw = { id?: string; name?: string; created?: number; pricing?: { prompt?: string; completion?: string } };

/** Pick the newest two priced models of each maker from OpenRouter's list (variants like «:free» or «:batch» left out). */
export function pickModels(data: Raw[], perMaker = 2): Model[] {
  const out: Model[] = [];
  for (const maker of MAKERS) {
    const mine = data
      .filter((m) => typeof m.id === "string" && m.id.startsWith(`${maker}/`) && !m.id.includes(":"))
      .map((m) => ({ id: m.id!, name: String(m.name ?? m.id).replace(/^[^:]+:\s*/, ""), inPerM: Number(m.pricing?.prompt) * 1e6, outPerM: Number(m.pricing?.completion) * 1e6, created: Number(m.created) || 0 }))
      .filter((m) => Number.isFinite(m.inPerM) && Number.isFinite(m.outPerM) && m.inPerM > 0 && m.outPerM > 0)
      .sort((a, b) => b.created - a.created);
    out.push(...mine.slice(0, perMaker));
  }
  return out;
}

/** Server side: the list, cached for a day. Empty when OpenRouter can't be reached (the page says so — no made-up prices). */
export async function liveModels(): Promise<{ models: Model[]; at: string }> {
  try {
    const r = await fetch(SOURCE_URL, { next: { revalidate: 86_400 }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return { models: [], at: "" };
    const j = (await r.json()) as { data?: Raw[] };
    return { models: pickModels(j.data ?? []), at: r.headers.get("date") ?? new Date().toUTCString() };
  } catch { return { models: [], at: "" }; }
}

/** Tokens ≈ words × 1.35 (English; other languages use more). A month = 30 days. */
export function monthlyCost(m: Pick<Model, "inPerM" | "outPerM">, p: { perDay: number; wordsIn: number; wordsOut: number }): number {
  const perDay = Math.max(0, p.perDay || 0), tin = Math.max(0, p.wordsIn || 0) * 1.35, tout = Math.max(0, p.wordsOut || 0) * 1.35;
  return ((perDay * 30) * (tin * m.inPerM + tout * m.outPerM)) / 1e6;
}
