import type { Lang } from "./i18n";
import { tr } from "@/lib/i18n-server";
import type { ChatMsg } from "./ai";
import type { ToolDef } from "./tools/defs";
import { hint } from "./crypto";

// Talks to the worker that hosts unmodified Claude Code for users' own Claude Pro/Max plans (worker/claude.mjs).
// Unchore never sees the user's Claude tokens: sign-in happens on Anthropic's page, Claude Code keeps the result
// in that user's folder on the worker, and the one-time code the user pastes is passed straight through.

/** «claude» = Claude Code on the worker (worker/claude.mjs), «chatgpt» = OpenAI's Codex on the worker (worker/chatgpt.mjs, 2026-10-01). */
export type Plan = "claude" | "chatgpt";

export class SubError extends Error {
  constructor(public why: string, public plan: Plan = "claude", public resetsAt?: string) { super(`${plan} plan: ${why}`); }
}

function base(): string {
  const u = process.env.BROWSER_WORKER_URL;
  if (!u) throw new SubError("worker_missing");
  return u.replace(/\/$/, "");
}

export async function subCall<T>(route: "login/start" | "login/finish" | "status" | "logout" | "interject", body: Record<string, unknown>, ms = 70_000, plan: Plan = "claude"): Promise<T> {
  const r = await fetch(`${base()}/${plan}/${route}`, {
    method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
    body: JSON.stringify(body), signal: AbortSignal.timeout(ms),
  }).catch(() => null);
  if (!r) throw new SubError("worker_unreachable", plan);
  return (await r.json().catch(() => ({ ok: false, why: `worker_${r.status}` }))) as T;
}

/** Model names Claude Code understands: opus / sonnet / haiku; Codex (plan «chatgpt»): gpt-6-sol / gpt-6-astra / gpt-6-luna. */
export async function* subChat(o: { userId: string; model: string; system: string; messages: ChatMsg[]; signal?: AbortSignal; timeoutMs?: number; plan?: Plan; webSearch?: boolean; connectors?: boolean; side?: boolean; tools?: ToolDef[]; toolToken?: string; onStatus?: (tool: string) => void; turn?: string }): AsyncGenerator<string> {
  const plan = o.plan ?? "claude";
  const r = await fetch(`${base()}/${plan}/chat`, {
    method: "POST", signal: o.signal,
    headers: { "content-type": "application/json", Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
    body: JSON.stringify({ user: o.userId, model: o.model, system: o.system, messages: o.messages, timeoutMs: o.timeoutMs, webSearch: o.webSearch === true,
      // The member's own claude.ai connectors, read-only (Settings switch, off by default — worker/claude.mjs turnHome · connector-guard.mjs).
      ...(plan === "claude" && o.connectors === true ? { connectors: true } : {}),
      // A title/memory/judging call: the worker's side seats, so it never holds a member's answer in line (worker/slots.mjs).
      ...(o.side === true ? { side: true } : {}),
      // Messages sent mid-answer go into this answer (lib/interject.ts → worker/claude.mjs interject).
      ...(plan === "claude" && o.turn && o.side !== true ? { turn: o.turn } : {}),
      ...(plan === "claude" && o.tools?.length && o.toolToken ? { tools: o.tools, toolToken: o.toolToken } : {}) }),
  }).catch(() => null);
  if (!r || !r.ok || !r.body) throw new SubError("worker_unreachable", plan);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let tail = "";
  for (;;) {
    // The connection dropping mid-answer (the worker restarting) is the worker's trouble, not an unknown crash of the answer.
    const { done, value } = await reader.read().catch(() => { throw new SubError("worker_cut", plan); });
    if (done) break;
    let piece = tail + dec.decode(value, { stream: true });
    tail = "";
    // «\u0002name\u0002» = the worker says a tool started (worker/claude.mjs); a half marker waits for the next chunk.
    for (let a = piece.indexOf("\u0002"); a >= 0; a = piece.indexOf("\u0002")) {
      const b = piece.indexOf("\u0002", a + 1);
      if (b < 0) { tail = piece.slice(a); piece = piece.slice(0, a); break; }
      o.onStatus?.(piece.slice(a + 1, b));
      piece = piece.slice(0, a) + piece.slice(b + 1);
    }
    if (tail) { if (piece) yield piece; continue; }
    const nul = piece.indexOf("\u0000");
    if (nul >= 0) {
      if (nul > 0) yield piece.slice(0, nul);
      tail = piece.slice(nul);
      continue;
    }
    yield piece;
  }
  if (tail.startsWith("\u0000")) {
    let why = "other", resetsAt: string | undefined;
    try { const t = JSON.parse(tail.slice(1)) as { why?: string; resetsAt?: string }; why = t.why ?? why; resetsAt = typeof t.resetsAt === "string" ? t.resetsAt : undefined; } catch { /* partial */ }
    throw new SubError(why, plan, resetsAt);
  }
}

/** Have the member's plan program started on the worker before they send (worker/warm.mjs) — the same model, web search and
 *  tools the turn will send, or it is simply not used. Best effort: never throws, gives up after 5 s. */
export async function subWarm(o: { userId: string; plan: Plan; model: string; webSearch: boolean; tools?: ToolDef[] }): Promise<string> {
  const r = await fetch(`${base()}/${o.plan}/warm`, {
    method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
    body: JSON.stringify({ user: o.userId, model: o.model, webSearch: o.webSearch, ...(o.plan === "claude" && o.tools?.length ? { tools: o.tools } : {}) }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);
  return ((await r?.json().catch(() => null)) as { state?: string } | null)?.state ?? "unreachable";
}

/** What the AI connections row shows, so the member can tell which account a plan is signed in with: «ChatGPT · ••••mino@gmail.com».
 *  Only the last 4 letters before the @ are kept (the same as keys). No e-mail (or an odd one) → just the plan name. */
export function planLabel(name: string, email?: string | null): string {
  const m = typeof email === "string" ? /^([^\s@]+)@([^\s@]+)$/.exec(email.trim()) : null;
  return m ? `${name} · ${hint(m[1]!)}@${m[2]}` : name;
}

/** «Oct 5, 9:00 PM» in the member's time zone and language; null when there is no time or it can't be shown. */
export function liftTime(iso: string | undefined, lang: string, tz?: string): string | null {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return null;
  try { return new Intl.DateTimeFormat(lang, { timeZone: tz || "UTC", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(t)); }
  catch { return null; }
}

/** What to tell the user when their Claude (or ChatGPT) plan couldn't answer. */
export function subMessage(why: string, lang: Lang, plan: Plan = "claude", lift?: { resetsAt?: string; tz?: string }): string {
  // the AI company said when the limit lifts (worker/reset-at.mjs): tell the exact time in the member's own time zone, not «soon»
  const at = why === "limit" ? liftTime(lift?.resetsAt, lang, lift?.tz) : null;
  if (at) return plan === "chatgpt"
    ? tr(lang, "Your ChatGPT plan hit its usage limit. You can use it again at {time} — or tap the AI name under the box to pick another.", { time: at })
    : tr(lang, "Your Claude plan hit its usage limit. You can use it again at {time} — or tap the AI name under the box to pick another.", { time: at });
  if (plan === "chatgpt") {
    if (why === "limit") return tr(lang, "Your ChatGPT plan hit its usage limit. It resets soon — or tap the AI name under the box to pick another.");
    if (why === "signed_out") return tr(lang, "Your ChatGPT plan got signed out. Type {cmd} here and I'll walk you through reconnecting.", { cmd: `«${tr(lang, "connect ChatGPT")}»` });
    if (why === "busy") return tr(lang, "Busy right now — please send again in a few seconds.");
    return tr(lang, "Couldn't answer with your ChatGPT plan. Please try again shortly.");
  }
  if (why === "limit") return tr(lang, "Your Claude plan hit its usage limit. It resets soon — or tap the AI name under the box to pick another.");
  if (why === "blocked") return tr(lang, "Your company has turned off Claude plan access for this account. Paste an Anthropic API key here, or tap the AI name under the box to pick another.");
  if (why === "signed_out") return tr(lang, "Your Claude plan got signed out. Type {cmd} here and I'll walk you through reconnecting.", { cmd: `«${tr(lang, "connect Claude")}»` });
  if (why === "busy") return tr(lang, "Busy right now — please send again in a few seconds.");
  return tr(lang, "Couldn't answer with your Claude plan. Please try again shortly.");
}

/** A message the member sent while their Claude plan is answering: true = it went into that answer (lib/interject.ts). */
export async function subInterject(userId: string, turn: string, text: string, images: { mime: string; b64: string }[] = []): Promise<boolean> {
  return subCall<{ ok?: boolean }>("interject", { user: userId, turn, text, ...(images.length ? { images } : {}) }, images.length ? 20_000 : 5_000).then((r) => r.ok === true).catch(() => false);
}
