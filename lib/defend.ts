// Defend — security analysis for the people defending a system (2026-09-30 owner «yes»; ported from AI Soul's
// security-analyst). Logs, code or a suspicious file go to Claude first; if an AI refuses (US safety filters sometimes
// refuse the defender too), the next one takes over: Claude → GPT → GLM → DeepSeek. Personal data and secrets are masked
// before anything leaves Unchore. GLM and DeepSeek run only on US hosts that don't train on the data.
// Paid from Unchore credit (lib/credits.ts) or the member's own OpenRouter key.

import { wordsRe } from "./words";
import W_REFUSAL from "./words/refusal.json";

const OPENROUTER_US = "https://us.openrouter.ai/api/v1/chat/completions";
const US_HOSTS = ["fireworks", "together", "deepinfra", "baseten"];

export const CHAIN: Record<string, { model: string; only?: string[] }> = {
  claude: { model: "anthropic/claude-opus-5.5" },
  gpt: { model: "openai/gpt-6-astra" },
  glm: { model: "z-ai/glm-5.3", only: US_HOSTS },
  deepseek: { model: "deepseek/deepseek-v4.1-flash", only: US_HOSTS },
};
export const DEFAULT_ORDER = ["claude", "gpt", "glm", "deepseek"];
export const MAX_INPUT = 120_000;

const SYSTEM = [
  "You are a security analyst working for the defender. The user runs or protects the system in question and shares its logs, code,",
  "configuration or a suspicious file so you can find what happened: the attack path, when, what was touched or leaked, how bad it is,",
  "and what to fix first. Personal data and secrets were masked before reaching you. Be concrete and prioritised.",
  "Stay on the defensive side: explain how an attack works only as far as needed to detect and stop it; do not write new working",
  "exploits or malware. Answer in the language of the user's question.",
].join(" ");

// Phone, resident/SSN-like ids, card/account numbers, e-mail, and key-shaped secrets.
const MASKS: [RegExp, string][] = [
  [/\b01[016789][-\s]?\d{3,4}[-\s]?\d{4}\b/g, "[phone masked]"],
  [/\b\d{6}[-\s]?[1-4]\d{6}\b/g, "[id number masked]"],
  [/\b\d{3}-\d{2}-\d{4}\b/g, "[id number masked]"],
  [/\b(?:\d[ -]?){13,19}\b/g, "[card/account masked]"],
  [/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, "[email masked]"],
  [/\b(sk-[A-Za-z0-9_-]{12,}|unc_[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{12,}|xox[abprs]-[A-Za-z0-9-]{10,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g, "[secret masked]"],
  [/(-----BEGIN [A-Z ]*PRIVATE KEY-----)[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----)/g, "$1 [secret masked] $2"],
];

export function mask(text: string): { text: string; hits: number } {
  let out = text, hits = 0;
  for (const [re, rep] of MASKS) out = out.replace(re, (...a) => { hits++; return rep.replace(/\$(\d)/g, (_, i) => String(a[Number(i)] ?? "")); });
  return { text: out, hits };
}

const REFUSAL = /(도와드릴 수 없|도와드리기 어렵|제공할 수 없|제공해 드릴 수 없|할 수 없습니다|하기 어렵습니다|도움을 드릴 수 없|can'?t (help|assist|provide)|cannot (help|assist|provide|comply)|i'?m (sorry|not able|unable)|against (my|our|the) (policy|guidelines)|i (can not|cannot) )/i;

const REFUSAL_ANY = wordsRe(W_REFUSAL);   // every other language (lib/words) — the analysis may be asked in any language
/** A short answer that opens with a refusal is a refusal; a long analysis that mentions «I can't» somewhere is not. */
export function isRefusal(text: string): boolean {
  const t = text.trim();
  return !t || ((REFUSAL.test(t.slice(0, 120)) || REFUSAL_ANY.test(t.slice(0, 120))) && t.length < 600);
}

export type Try = { ai: string; model: string; status: "ok" | "refused" | "error"; why: string; cost: number };

async function ask(ai: string, key: string, prompt: string, signal?: AbortSignal): Promise<Try & { text: string }> {
  const { model, only } = CHAIN[ai]!;
  const base = { ai, model, cost: 0, text: "" };
  let res: Response;
  try {
    res = await fetch(OPENROUTER_US, {
      method: "POST", signal: signal ?? AbortSignal.timeout(110_000),
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json", "HTTP-Referer": "https://unchore.ai", "X-Title": "Unchore Defend" },
      body: JSON.stringify({
        model, stream: false, max_tokens: 2500, usage: { include: true },
        provider: { allow_fallbacks: true, data_collection: "deny", ...(only ? { only } : {}) },
        messages: [{ role: "system", content: SYSTEM }, { role: "user", content: prompt }],
      }),
    });
  } catch (e) {
    return { ...base, status: "error", why: String((e as Error).message ?? e).slice(0, 120) };
  }
  if (!res.ok) {
    const raw = (await res.text().catch(() => "")).slice(0, 300);
    if (res.status === 403 && /flagged_input|moderation|"reasons"/i.test(raw)) return { ...base, status: "refused", why: "moderation (403)" };
    return { ...base, status: "error", why: `HTTP ${res.status}` };
  }
  const j = (await res.json().catch(() => ({}))) as { choices?: { message?: { content?: string } }[]; usage?: { cost?: number } };
  const text = (j.choices?.[0]?.message?.content ?? "").trim();
  const cost = Number(j.usage?.cost ?? 0) || 0;
  if (isRefusal(text)) return { ...base, cost, status: "refused", why: text ? "refusal" : "empty answer", text };
  return { ...base, cost, status: "ok", why: "", text };
}

export type DefendResult = { answer: string | null; answered_by: string | null; model: string | null; masked: number; tried: Try[]; cost: number };

/** Mask, then ask down the chain until one AI answers. `cost` = what OpenRouter charged for every try (USD). */
export async function defend(key: string, question: string, order: string[] = DEFAULT_ORDER, signal?: AbortSignal): Promise<DefendResult> {
  const { text, hits } = mask(question);
  const tried: Try[] = [];
  let cost = 0;
  for (const ai of order.filter((x) => CHAIN[x])) {
    const r = await ask(ai, key, text, signal);
    cost += r.cost;
    tried.push({ ai: r.ai, model: r.model, status: r.status, why: r.why, cost: r.cost });
    if (r.status === "ok") return { answer: r.text, answered_by: ai, model: r.model, masked: hits, tried, cost };
  }
  return { answer: null, answered_by: null, model: null, masked: hits, tried, cost };
}
