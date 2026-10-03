// Jev — a cheap multiple-choice judge on OpenRouter («decisions», typesafe/jev-1.13), ported from AI Soul (worker/engines/jev-pick.ts).
// Used only when the member connected OpenRouter (their key, ~$0.00002 a call): «does this question need the strong model?»
// and «who is this?» in the first chat. Never blocks a turn: 3 s limit, any failure → the old rule-based answer.
import { houseKey } from "./credits";
export const JEV_MODEL = "typesafe/jev-1.13";
export type JevAnswer = { choice: string | null; confidence: number | null };
type Question = { type: "choice"; instructions: string; criteria: Record<string, string> };

/** Ask Jev. Returns the answers, or null on timeout/error. (Races its own timer: an abort that meets a reply can hang fetch — Soul 2026-09-29.) */
export async function jevAsk(key: string, state: Record<string, string>, questions: Record<string, Question>, timeoutMs = 3000): Promise<Record<string, JevAnswer> | null> {
  const ctl = new AbortController();
  let t: ReturnType<typeof setTimeout> | undefined;
  const work = (async () => {
    try {
      const r = await fetch(process.env.UNCHORE_JEV_URL ?? "https://openrouter.ai/api/alpha/decisions", {
        method: "POST", signal: ctl.signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${key}`, "user-agent": "unchore-jev" },
        body: JSON.stringify({ model: JEV_MODEL, state, questions }),
      });
      if (!r.ok) return null;
      const j = (await r.json()) as { answers?: Record<string, { choice?: string; confidence?: number }> };
      return Object.fromEntries(Object.entries(j.answers ?? {}).map(([k, a]) => [k, { choice: a?.choice ?? null, confidence: typeof a?.confidence === "number" ? a.confidence : null }]));
    } catch { return null; }
  })();
  const late = new Promise<null>((ok) => { t = setTimeout(() => { ctl.abort(); ok(null); }, timeoutMs); });
  try { return await Promise.race([work, late]); } finally { clearTimeout(t); }
}

/** Whose OpenRouter key asks Jev: the member's own, else Unchore's house key (owner «예» 2026-10-03), «» = none (off: UNCHORE_JEV_HOUSE=off). */
export const jevKeyFor = (memberKey?: string | null): string => memberKey || (process.env.UNCHORE_JEV_HOUSE === "off" ? "" : houseKey());

/** «Auto-pick»: strong or fast for this question? null = Jev didn't answer (caller keeps the rule). Unsure → strong (a weak wrong answer costs more). */
export async function jevNeedsStrong(key: string, question: string, voice = false): Promise<boolean | null> {
  const a = await jevAsk(key, { message: question.slice(0, 3000) }, {
    depth: { type: "choice", instructions: "Which model is enough for a good answer to this message? Pick the cheapest that is enough; if a wrong answer would be costly, pick strong.",
      criteria: { fast: "chat, short facts, simple how-to, quick rewrites", strong: "multi-step reasoning, planning, analysis, code, long or careful writing, money/legal/health stakes" } },
  });
  const d = a?.depth;
  if (!d?.choice) return null;
  return strongFrom(d, voice);
}
/** Voice mode takes Jev's pick as is — no «unsure → strong» step up. AI Soul 2026-09-30: 69 of 83 stepped-up voice turns spoke
 *  3.5–6 s later and guessed no less often (AI Soul bfd51cd). Typed chat keeps the step up. */
export function strongFrom(d: JevAnswer, voice: boolean): boolean {
  return d.choice === "strong" || (!voice && (d.confidence ?? 0) < 0.6);
}

/** First chat: which face? Only a confident answer counts (≥ 0.7), else null. */
export async function jevFace(key: string, text: string, faces: readonly string[]): Promise<string | null> {
  const labels: Record<string, string> = { student: "a student", worker: "an office worker", shop: "runs a shop or small business", builder: "a developer or startup founder", senior: "older and new to technology", general: "not clear yet" };
  const a = await jevAsk(key, { message: text.slice(0, 2000) }, {
    face: { type: "choice", instructions: "From this first message, who is this person most likely?", criteria: Object.fromEntries(faces.map((f) => [f, labels[f] ?? f])) },
  });
  const f = a?.face;
  return f?.choice && f.choice !== "general" && faces.includes(f.choice) && (f.confidence ?? 0) >= 0.7 ? f.choice : null;
}
