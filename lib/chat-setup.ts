// Set things up by talking, not by visiting Settings (owner 2026-09-30: «beginners give up at the Settings page — do it in the chat»).
// Pure helpers shared by the chat screen and the server. Secrets typed into the chat never reach the AI: the screen catches them first.
import { wordsRe } from "./words";
import W_CONNECT from "./words/connect_verb.json";
import W_DISCONNECT from "./words/disconnect_verb.json";
import W_ANSWER_WITH from "./words/answer_with.json";

const CONNECT_ANY = wordsRe(W_CONNECT), DISCONNECT_ANY = wordsRe(W_DISCONNECT);   // every other language (lib/words)

import type { KeyProvider } from "./ai";
export type { KeyProvider };

/** An API key pasted into the chat (alone or inside a sentence) → which AI it opens. A plain «sk-…» is ChatGPT, DeepSeek
 *  or Kimi — they look alike, so it comes back as «auto» and the server tries them (app/api/settings/keys). */
export function detectKey(text: string): { provider: KeyProvider | "auto"; key: string } | null {
  const g = text.match(/\bAIza[0-9A-Za-z_-]{30,}|\bAQ\.[0-9A-Za-z_-]{40,}/);   // Google AI Studio: old «AIza…», newer «AQ.…» (seen 2026-10-01)
  if (g) return { provider: "gemini", key: g[0] };
  const x = text.match(/\bxai-[A-Za-z0-9_-]{20,}/);
  if (x) return { provider: "xai", key: x[0] };
  const m = text.match(/\bsk-(ant-|or-|proj-|svcacct-)?[A-Za-z0-9_-]{20,}/);
  if (!m) return null;
  const key = m[0];
  const provider = key.startsWith("sk-ant-") ? "anthropic" : key.startsWith("sk-or-") ? "openrouter" : /^sk-(proj|svcacct)-/.test(key) ? "openai" : "auto";
  return { provider, key };
}

/** Which companies a key could be from, likeliest first. A plain «sk-…» is ChatGPT, DeepSeek (32 hex) or Kimi; a shape we
 *  don't know yet (a company changed its key format) is tried everywhere that answers a model list. */
export function skGuesses(key: string): ("openai" | "deepseek" | "kimi" | "gemini" | "xai")[] {
  if (!key.startsWith("sk-")) return ["gemini", "xai", "openai", "deepseek", "kimi"];
  return /^sk-[0-9a-f]{32}$/.test(key) ? ["deepseek", "openai", "kimi"] : ["openai", "kimi", "deepseek"];
}

/** In the «I have an API key» step: one long token with no spaces is a key even if its shape is new — never sent to the AI. */
export function looksLikeKey(text: string): boolean {
  return /^[A-Za-z0-9_\-.:]{24,400}$/.test(text.trim());
}

/** The one-time code Claude shows after «Authorize»: one long token, no spaces (often «code#state»). */
export function looksLikeClaudeCode(text: string): boolean {
  const t = text.trim();
  return /^[A-Za-z0-9_\-#.~]{20,500}$/.test(t) && !t.startsWith("sk-");
}

/** What the chat shows instead of a secret: the first few and last four characters. */
export function maskSecret(s: string): string {
  return s.length <= 12 ? "••••" : `${s.slice(0, s.startsWith("sk-") ? 7 : 3)}…${s.slice(-4)}`;
}

/** «클로드 연결», «connect my Claude», «AI 다시 연결», or the screen language's own «connect Claude» (`said`, e.g. «conectar Claude»)
 *  — show the connect steps in the chat (which steps: connectWhich). */
export function wantsConnect(text: string, said = ""): boolean {
  const t = text.trim();
  const norm = (x: string) => x.toLowerCase().replace(/[«»"'.!?。！？\s]+/g, "");
  if (said && t.length <= 40 && norm(t).includes(norm(said))) return true;
  return t.length <= 40 && (/(연결|connect)/i.test(t) || CONNECT_ANY.test(t)) && /(클로드|claude|ai|에이아이|열쇠|키|key|gpt|지피티|openrouter|오픈라우터|gemini|제미나이|grok|그록|deepseek|딥시크|kimi|키미)/i.test(t)
    && !/(끊|해제|disconnect|unplug)/i.test(t) && !DISCONNECT_ANY.test(t);
}

/** Which steps «connect …» opens: a key (they named a key or an AI that only takes keys), their ChatGPT plan, else their Claude plan. */
export function connectWhich(text: string, saidGpt = ""): "key" | "chatgpt" | "claude" {
  const norm = (x: string) => x.toLowerCase().replace(/[«»"'.!?。！？\s]+/g, "");
  if (/(열쇠|키|key|api|openrouter|오픈라우터|gemini|제미나이|grok|그록|deepseek|딥시크|kimi|키미)/i.test(text)) return "key";
  if ((saidGpt && norm(text).includes(norm(saidGpt))) || /(gpt|지피티|챗gpt|openai|오픈ai)/i.test(text)) return "chatgpt";
  return "claude";
}

export const KEY_NAME: Record<KeyProvider, string> = { anthropic: "Claude (Anthropic)", openai: "ChatGPT (OpenAI)", openrouter: "OpenRouter", gemini: "Gemini (Google)", xai: "Grok (xAI)", deepseek: "DeepSeek", kimi: "Kimi (Moonshot)" };

// ── Settings by asking: the AI puts a mark on its last line, the server applies it and says what changed under the answer.
export const SET_KEYS = ["lang", "theme", "tz", "model", "memory", "web", "email", "improve", "name", "rules+", "rules", "disconnect"] as const;
export type SetKey = (typeof SET_KEYS)[number];
export type SetMark = { key: SetKey; value: string };

const SET_RE = /<<<set\s+(lang|theme|tz|model|memory|web|email|improve|name|rules\+|rules|disconnect)\s*=\s*([^\n>]{1,300}?)\s*>>>/g;
/** Pull the marks out of an answer; unknown or malformed marks are dropped (and hidden). */
export function readSetMarks(text: string): { text: string; marks: SetMark[] } {
  const marks: SetMark[] = [];
  const out = text.replace(SET_RE, (_a, k: SetKey, v: string) => { marks.push({ key: k, value: v.trim() }); return ""; })
    .replace(/<<<set\b[^>]*>>>/g, "").replace(/\n{3,}/g, "\n\n").trim();
  return { text: out, marks };
}

/** A box for a saved login («<<<secret name=airline-login>>>»): the value goes straight to the vault, never through the AI. */
export const SECRET_RE = /<<<secret\s+name\s*=\s*["'`]?([\w.@-][\w.@ -]{0,59}?)["'`]?\s*>>>/g;
export function readSecretAsks(text: string): { text: string; names: string[] } {
  const names: string[] = [];
  const out = text.replace(SECRET_RE, (_a, n: string) => { names.push(n.trim()); return ""; }).trim();
  return { text: out, names };
}

/** Hide every app mark while an answer is still streaming (a half-written «<<<…» too). */
// A mark still being written is hidden to the end of the line — even one whose text has «>» or that ends «}>» before «>>>» (seen on screen 2026-10-01).
export function hideMarks(text: string): string {
  text = text.replace(/```unchore-screen[\s\S]*?(?:```|$)/g, "");
  return text.replace(/<<<tasks>>>[\s\S]*?(?:<<<endtasks>>>[ \t]*\n?|$)/g, "").replace(/<<<remind-edit\b[\s\S]*?(?:<<<end>>>|$)/g, "").replace(/<<<(set|nudge|secret|stopbuild|remind-off)\b[^>]*>>>/g, "").replace(/<<<(google|build|meta|domain|hf|remember) ?\{[^\n]*\}\s*>>>/g, "").replace(/<<<[a-z]*[^\n]*$/, "").trimEnd();
}

const ONOFF: Record<string, boolean> = { on: true, off: false, true: true, false: false, yes: true, no: false };
export const onOff = (v: string): boolean | null => ONOFF[v.toLowerCase()] ?? null;

// ── «이번엔 제미나이로 답해 줘» / «ask Grok»: this one answer from the AI they named (owner 2026-10-01). Their default stays;
// the answer then asks once whether to keep it (a «yes» sets it through the usual <<<set model=…>>>).
const FAMILY: { re: RegExp; ids: string[] }[] = [
  { re: /(클로드|claude)/i, ids: ["sub:sonnet", "claude-sonnet-5", "anthropic/claude-sonnet-5", "uc:anthropic/claude-sonnet-5"] },
  { re: /(지피티|gpt|chatgpt|챗gpt)/i, ids: ["cx:gpt-6-sol", "gpt-6-sol"] },
  { re: /(제미나이|제미니|gemini)/i, ids: ["gemini:gemini-pro-latest", "uc:google/gemini-3.8-flash"] },
  { re: /(그록|grok)/i, ids: ["xai:grok-4.7"] },
  { re: /(딥시크|deepseek)/i, ids: ["deepseek:deepseek-chat", "deepseek/deepseek-v4.1-flash", "uc:deepseek/deepseek-v4.1-flash"] },
  { re: /(키미|kimi)/i, ids: ["kimi:kimi-k3"] },
];
/** Korean «X로/으로 (답·대답·해·알려·물어·써)», English «use / ask / with / via / switch to X». Short messages only. */
const ASK_WITH = /(로|으로)\s*(답|대답|해|알려|물어|써|말해|바꿔)|\b(use|using|ask|answer with|reply with|via|switch to)\b/i;
const ASK_WITH_ANY = wordsRe(W_ANSWER_WITH);   // every other language (lib/words)
export function namedAi(text: string, usable: (id: string) => boolean): string | null {
  const t = text.trim();
  if (t.length > 160 || !(ASK_WITH.test(t) || ASK_WITH_ANY.test(t))) return null;
  const hits = FAMILY.filter((f) => f.re.test(t));
  if (hits.length !== 1) return null;   // «GPT와 클로드 비교해 줘» — two names is a question about them, not a pick
  return hits[0]!.ids.find(usable) ?? null;
}
