import { langInfo } from "@/lib/i18n";
import { tr } from "@/lib/i18n-server";
import type { Lang } from "./i18n";
import { complete, firstJson } from "./ai";
import { catalogText, getRecipe } from "./recipes";
import { validSchedule } from "./schedule";

export type Plan = {
  title: string;
  recipe: string;
  args: Record<string, unknown>;
  schedule: string;
  condition: { kind: "always" | "below" | "above" | "changed"; value?: number };
};

const PICK_RULES = (today: string, tz: string, lang: Lang) => `You turn a user's request into a scheduled automation. Do NOT write code. Pick ONE verified recipe below and fill its arguments.
Recipes:
${catalogText({ lang, tz })}

Also choose:
- schedule: "daily@HH:MM" (24h, user's local time), "weekly@D@HH:MM" (D 0=Sun..6=Sat), "days@DDD@HH:MM" for several weekdays (weekdays = days@12345@HH:MM), "monthly@DD@HH:MM" (that day each month), "yearly@MM-DD@HH:MM" (that date every year), "hourly" or "every:Nh". Prices/fares: daily@08:00 unless the user said otherwise.
- condition: {"kind":"always"} to report every run, {"kind":"below","value":N} / {"kind":"above","value":N} for price targets, {"kind":"changed"} to report only when the result changes (news, page watch).
- title: short, in the user's language.
Use the times, days, dates, places, product names and price lines the user gave anywhere in the request or your answer — never fall back to a default when they said one. If they gave two times, use the first and say both in the title.
Use page_watch only for a page address the user gave. If nothing fits, use ai_digest (writing) or reminder (fixed text).
A reminder's text is the reminder itself (e.g. «Take your blood-pressure pill», «Report due tomorrow»): never make it ask the user for something («send me the link», «tell me the date») or say what isn't supported — with a missing detail, write the most useful reminder you can from what they said.
Today is ${today}; user time zone ${tz}.
Reply with ONE JSON line: {"title":"...","recipe":"...","args":{...},"schedule":"...","condition":{...}}`;

export async function pickPlan(o: { model: string; key: string; question: string; offer: string; answer?: string; lang: Lang; tz: string }): Promise<Plan> {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: o.tz });
  const text = await complete({
    model: o.model, key: o.key, maxTokens: 400, system: PICK_RULES(today, o.tz, o.lang),
    messages: [{ role: "user", content: `User language: ${langInfo(o.lang).en}\nRequest (the user's last messages, oldest first):\n${o.question.slice(-1500)}${o.answer ? `\nYour last answer (what you agreed to set up):\n${o.answer.replace(/<<<[\s\S]*?(?:<<<end>>>|$)/g, "").slice(0, 800)}` : ""}\nOffer accepted: ${o.offer}` }],
  });
  return normalizePlan(firstJson<Partial<Plan>>(text), o.question, o.lang);
}

/** Validate the AI's plan; fall back to an AI brief with the user's own words if anything is off. */
export function normalizePlan(p: Partial<Plan> | null, question: string, lang: Lang): Plan {
  const fallback: Plan = { title: question.slice(0, 60), recipe: "ai_digest", args: { prompt: question.slice(0, 900) }, schedule: "daily@08:00", condition: { kind: "always" } };
  if (!p || typeof p.recipe !== "string") return fallback;
  const r = getRecipe(p.recipe);
  if (!r || !r.args.safeParse(p.args ?? {}).success) return fallback;
  // A page watch only on a page the member gave: an address the AI came up with failed on its very first read
  // (night round 13: a café owner's «bean prices» became a watch on an invented ico.org page → 404, nothing switched on).
  if (r.id === "page_watch") {
    const host = (() => { try { return new URL(String((p.args as { url?: unknown }).url)).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } })();
    if (!host || !question.toLowerCase().includes(host)) return fallback;
  }
  const schedule = typeof p.schedule === "string" && validSchedule(p.schedule) ? p.schedule : "daily@08:00";
  const c = p.condition;
  const kind = c && ["always", "below", "above", "changed"].includes(String(c.kind)) ? c.kind! : "always";
  const value = typeof c?.value === "number" && Number.isFinite(c.value) ? c.value : undefined;
  const condition = (kind === "below" || kind === "above") && value === undefined ? { kind: "always" as const } : { kind, ...(value !== undefined ? { value } : {}) };
  const title = (typeof p.title === "string" && p.title.trim()) ? p.title.trim().slice(0, 80) : tr(lang, r.title.en);
  return { title, recipe: r.id, args: r.args.parse(p.args ?? {}) as Record<string, unknown>, schedule, condition };
}
