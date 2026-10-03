import { langInfo } from "./i18n";
import type { Lang } from "./i18n";
import { complete, firstJson } from "./ai";
import { recipesFor, runRecipe } from "./recipes";
import type { RecipeResult } from "./recipes/types";

// «Live answer»: before answering, if the question needs a value that a verified recipe can read right now,
// read it first and hand it to the answering AI. The AI never invents live numbers.
// The ads guard pauses ads — never from a question; the report card reads only, so it may answer «how are my ads doing?».
const live = (who: { lang: Lang; tz: string }) => recipesFor(who).filter((r) => !["ai_digest", "reminder", "meta_ads_guard"].includes(r.id));

export const RULES = (today: string, who: { lang: Lang; tz: string }) => `Decide which CURRENT values the user's question needs that these verified readers can fetch right now — one read per distinct value, at most ${MAX_READS} (e.g. a morning brief of the weather, the dollar rate and AI news = three reads; economy news and AI news = two news reads).
Readers:
${live(who).map((r, i) => `${i + 1}) ${r.catalog}`).join("\n")}
Only read what the question clearly asks for as a live value a reader covers (price, lowest price, fare, rate, weather, headlines, a page's current notice), or asks to be told when such a value crosses a line or changes — then today's value helps them choose the line (night 2026-10-01: «tell me when Bitcoin drops below a price I choose» answered «I didn't check the current price») — or asks to be kept posted on such a value on a schedule («keep an eye on the dollar rate for me», «send me the gold price every morning») — today's value shows what they will get (round 11: that answered «I can't look up the rate right now»). Otherwise no reads.
Today is ${today}. Reply with ONE JSON line: {"reads":[{"recipe":"...","args":{...}}]} or {"reads":[]}.`;

/** At most this many live reads per answer (night 2026-10-01: a «5 things I check every morning» brief could read only one). */
export const MAX_READS = 4;

/** The reads in the picker's reply — the list shape, or the older single {"recipe","args"}; at most MAX_READS. */
export function parseReads(text: string): { recipe: string; args: Record<string, unknown> }[] {
  const j = firstJson<{ reads?: unknown; recipe?: unknown; args?: unknown }>(text);
  const raw = Array.isArray(j?.reads) ? j.reads : j?.recipe ? [j] : [];
  return raw.filter((x): x is { recipe: string; args?: Record<string, unknown> } => !!x && typeof (x as { recipe?: unknown }).recipe === "string")
    .slice(0, MAX_READS).map((x) => ({ recipe: x.recipe, args: x.args && typeof x.args === "object" ? x.args : {} }));
}

export type Live = { recipe: string; args: Record<string, unknown>; result: RecipeResult };

type LookupOpts = { model: string; key: string; question: string; lang: Lang; tz: string; secret?: (name: string) => Promise<string | null> };

/** Every live value the question needs, read now (in parallel). Empty when it needs none. */
export async function liveLookupAll(o: LookupOpts): Promise<Live[]> {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: o.tz });
  const text = await complete({ model: o.model, key: o.key, maxTokens: 400, system: RULES(today, o), messages: [{ role: "user", content: o.question.slice(0, 1500) }] }).catch(() => "");
  const readers = live(o);
  const picks = parseReads(text).flatMap((p) => {
    const r = readers.find((x) => x.id === p.recipe);
    return r && r.args.safeParse(p.args).success ? [{ id: r.id, args: p.args }] : [];
  });
  return Promise.all(picks.map(async (p) => ({ recipe: p.id, args: p.args, result: await runRecipe(p.id, p.args, { lang: o.lang, tz: o.tz, secret: o.secret, dry: true }).catch((e) => ({ ok: false as const, why: (e as Error).message.slice(0, 200) })) })));
}

/** The first live value only — a price line keeps one reader (lib/turn.ts «watch»). */
export async function liveLookup(o: LookupOpts): Promise<Live | null> {
  return (await liveLookupAll(o))[0] ?? null;
}

/** A turn with no read of its own that follows answers which quoted live values (night 2026-10-01 round 9: setting the reminder,
 *  the AI told the member «the figures in the earlier example were not checked live» — they had been read by the readers). */
export const EARLIER_LIVE = "Numbers with a named source in your earlier answers in this chat were read live by verified readers when you wrote them. Don't tell the member they weren't checked live or were only examples; if one may have moved since, just say each run reads it fresh.";

export function liveNote(l: Live, lang: Lang, tz?: string): string {
  // The read time in the member's own clock (night 2026-10-01: a morning brief said «the exact time of these values isn't shown»).
  // Round 6 → 7: said as «the current value» — with the clock alone, a reminder run by hand at 03:33 for a 07:00 slot wrote «I couldn't confirm the 07:00 values».
  const at = tz ? ` (${new Date().toLocaleString("en-CA", { timeZone: tz, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })} ${tz})` : "";
  if (l.result.ok) {
    return [
      `LIVE DATA (read just now${at} by the verified reader «${l.recipe}» — it is the current value: use it, quote the number exactly and name the source; don't remark on when it was read):`,
      l.result.line,
      ...(l.result.items ?? []).slice(0, 5).map((x) => `- ${x}`),
      l.result.url ? `Source: ${l.result.url}` : "",
    ].filter(Boolean).join("\n");
  }
  return `A live check with «${l.recipe}» just failed (${l.result.why}). Say you couldn't confirm the current value (in ${langInfo(lang).en}) instead of guessing.`;
}
