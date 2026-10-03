import { tr } from "@/lib/i18n-server";
import { open } from "./crypto";
import { q } from "./db";
import { SubError, subChat } from "./claude-sub";
import { anthropicSystem, stripPromptBoundary } from "./prompt-boundary";
import { wordsRe } from "./words";
import W_HEAVY from "./words/heavy_task.json";
import W_RISK from "./words/risk_task.json";
import { charge, creditReady, houseKey } from "./credits";
import type { ToolDef } from "./tools/defs";
import { SEARCH_KEY_PROVIDERS, eventSources, readEvent, searchRequest, sourcesFooter, sourcesLine, type SearchKeyProvider, type Src } from "./key-search";

// The member's own AI first: "claude_sub" = their Claude Pro/Max plan, run through unmodified Claude Code on our worker
// (lib/claude-sub.ts), or their own key. "credit" = Unchore credit (owner «yes» 2026-09-30): Unchore's OpenRouter account
// answers and the member's prepaid balance pays what it cost, no markup (lib/credits.ts). Its key slot holds the member id.
export type Provider = "claude_sub" | "chatgpt_sub" | "anthropic" | "openai" | "openrouter" | "gemini" | "xai" | "deepseek" | "kimi" | "credit";
export type ChatMsg = { role: "user" | "assistant"; content: string; images?: { mime: string; b64: string }[] };

export const MODELS: Record<Provider, { id: string; label: string; fast?: boolean }[]> = {
  claude_sub: [
    { id: "sub:opus", label: "Claude Opus (your Claude plan)" },
    { id: "sub:sonnet", label: "Claude Sonnet (your Claude plan)" },
    { id: "sub:haiku", label: "Claude Haiku (your Claude plan)", fast: true },
  ],
  // Their ChatGPT Plus/Pro plan through OpenAI's Codex on our worker (worker/chatgpt.mjs, owner 2026-10-01 «like AI Soul»).
  chatgpt_sub: [
    { id: "cx:gpt-6-sol", label: "GPT-6 Sol (your ChatGPT plan)" },
    { id: "cx:gpt-6-astra", label: "GPT-6 Astra (your ChatGPT plan)" },
    { id: "cx:gpt-6-luna", label: "GPT-6 Luna (your ChatGPT plan)", fast: true },
  ],
  anthropic: [
    { id: "claude-sonnet-5", label: "Claude Sonnet 5" },
    { id: "claude-opus-5-5", label: "Claude Opus 5.5" },
    { id: "claude-fable-5-1", label: "Claude Fable 5.1" },
    { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", fast: true },
  ],
  openai: [
    { id: "gpt-6-sol", label: "GPT-6 Sol" },
    { id: "gpt-6-astra", label: "GPT-6 Astra" },
    { id: "gpt-6-luna", label: "GPT-6 Luna", fast: true },
  ],
  openrouter: [
    { id: "openrouter/auto", label: "OpenRouter Auto" },
    { id: "anthropic/claude-sonnet-5", label: "Claude Sonnet 5 (OpenRouter)" },
    { id: "anthropic/claude-haiku-4.5", label: "Claude Haiku 4.5 (OpenRouter)", fast: true },
    // Only when the member picks them — never chosen by «Auto» (ported from AI Soul 2026-09-29, 5/5 answers each in its test).
    { id: "deepseek/deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash (OpenRouter)" },
    { id: "z-ai/glm-5.3", label: "GLM 5.3 (OpenRouter)" },
  ],
  // Their own key at the AI company itself (owner 2026-10-01). A name the company has since retired is swapped for its newest
  // one on the first «no such model» (compatModel), so an old list here never stops an answer.
  gemini: [
    { id: "gemini:gemini-pro-latest", label: "Gemini Pro" },
    { id: "gemini:gemini-flash-latest", label: "Gemini Flash", fast: true },
  ],
  xai: [
    { id: "xai:grok-4.7", label: "Grok 4.7" },
  ],
  deepseek: [
    { id: "deepseek:deepseek-chat", label: "DeepSeek", fast: true },
    { id: "deepseek:deepseek-reasoner", label: "DeepSeek (thinking)" },
  ],
  kimi: [
    { id: "kimi:kimi-k3", label: "Kimi K3" },
  ],
  credit: [
    { id: "uc:anthropic/claude-sonnet-5", label: "Claude Sonnet 5 (Unchore credit)" },
    { id: "uc:anthropic/claude-haiku-4.5", label: "Claude Haiku 4.5 (Unchore credit)", fast: true },
    { id: "uc:google/gemini-3.8-flash", label: "Gemini 3.8 Flash (Unchore credit)" },
    { id: "uc:deepseek/deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash (Unchore credit)" },
    { id: "uc:z-ai/glm-5.3", label: "GLM 5.3 (Unchore credit)" },
  ],
};

// Order = preference when the user hasn't picked: a plan they already pay for comes first.
export const PROVIDERS: Provider[] = ["claude_sub", "chatgpt_sub", "anthropic", "openai", "openrouter", "gemini", "xai", "deepseek", "kimi"];
/** Choosing order for answers: the member's own connections, then Unchore credit (never listed in Settings as a connection). */
const ORDER: Provider[] = [...PROVIDERS, "credit"];
/** Providers set up by pasting an API key (the Claude plan is connected by signing in instead). */
export const KEY_PROVIDERS = ["anthropic", "openai", "openrouter", "gemini", "xai", "deepseek", "kimi"] as const;
export type KeyProvider = (typeof KEY_PROVIDERS)[number];
/** Connections that can search the web in an answer: the Anthropic key (server web_search tool), OpenRouter and Unchore credit
 *  (web plugin), and both plans on the worker (Claude Code WebSearch with a privacy checkpoint · Codex web_search=live). The plans were
 *  missing until 2026-10-01 — a member on their own Claude plan got «I can't browse» while AI Soul searched on the same plan.
 *  Gemini, OpenAI and Grok keys since 2026-10-02 (lib/key-search.ts); DeepSeek and Kimi have no search to turn on. */
export const SEARCH_PROVIDERS: readonly Provider[] = ["anthropic", "openrouter", "credit", "claude_sub", "chatgpt_sub", ...SEARCH_KEY_PROVIDERS];
const isSearchKey = (p: Provider): p is SearchKeyProvider => (SEARCH_KEY_PROVIDERS as readonly Provider[]).includes(p);
export const canWebSearch = (model: string): boolean => SEARCH_PROVIDERS.includes(providerOf(model));
/** Signed in with a plan they pay for, not a key. */
export const PLAN_PROVIDERS = ["claude_sub", "chatgpt_sub"] as const;

/** Key AIs that take the OpenAI chat format at their own address. `family` picks a stand-in when a model name is retired. */
export const COMPAT = {
  gemini: { base: "https://generativelanguage.googleapis.com/v1beta/openai", family: /^gemini-[\d.]*-?(pro|flash)(-latest)?$/ },
  xai: { base: "https://api.x.ai/v1", family: /^grok-[\d.]+$/ },
  deepseek: { base: "https://api.deepseek.com", family: /^deepseek-chat$/ },
  kimi: { base: "https://api.moonshot.ai/v1", family: /^kimi-k[\d.]+$/ },
} as const;
export type CompatProvider = keyof typeof COMPAT;
const isCompat = (p: Provider): p is CompatProvider => p in COMPAT;

export function providerOf(model: string): Provider {
  if (model.startsWith("sub:")) return "claude_sub";
  if (model.startsWith("cx:")) return "chatgpt_sub";
  const pre = /^(gemini|xai|deepseek|kimi):/.exec(model)?.[1];
  if (pre) return pre as CompatProvider;
  if (model.startsWith("uc:")) return "credit";
  if (model.includes("/")) return "openrouter";
  if (model.startsWith("claude")) return "anthropic";
  return "openai";
}

/** Keys by provider. For "claude_sub" the value is the user id — the worker finds that user's Claude Code folder by it. */
export async function userKeys(userId: string): Promise<Partial<Record<Provider, string>>> {
  const rows = await q<{ provider: Provider; enc: string }>("select provider, enc from user_keys where user_id = $1", [userId]);
  const out: Partial<Record<Provider, string>> = {};
  for (const r of rows) {
    try { out[r.provider] = open(r.enc); } catch { /* key rotated or broken box — treat as missing */ }
  }
  if (await creditReady(userId)) out.credit = userId;
  return out;
}

/** Pick the model to answer with: the user's choice if its key exists, else the first provider with a key. */
export function chooseModel(keys: Partial<Record<Provider, string>>, wanted?: string | null): string | null {
  if (wanted && keys[providerOf(wanted)]) return wanted;
  for (const p of ORDER) if (keys[p]) return MODELS[p][0]!.id;
  return null;
}

/** «Auto» (ported idea from AI Soul's Jev): pick the strong or the fast model for this question without an extra AI call. */
const STRONG: Partial<Record<Provider, string>> = { claude_sub: "sub:opus", chatgpt_sub: "cx:gpt-6-sol", gemini: "gemini:gemini-pro-latest", deepseek: "deepseek:deepseek-reasoner", anthropic: "claude-opus-5-5", openai: "gpt-6-sol", openrouter: "anthropic/claude-sonnet-5", credit: "uc:anthropic/claude-sonnet-5" };
const HEAVY_ANY = wordsRe(W_HEAVY), RISK_ANY = wordsRe(W_RISK);   // every other language (lib/words)
// Costly-if-wrong words (health · money/law · bugs · security · «use the cheap model» steering), Korean and English.
// A blind test of 120 messages (2026-10-03, AI Soul Laya trial): weak picks for heavy questions 48/70 → 17/70, light kept 45/50 → 37/50.
const RISK_KO = /아프|아파|통증|숨[이 ]?(차|막|쉬)|호흡|가슴|심장|두근|어지러|기절|의식|마비|저려|저리|처졌|처지|어눌|꼬여|경련|발작|출혈|피가|피를|토하|구토|열이|고열|삼켰|삼킨|먹었는데|복용|약을|약 |처방|부작용|알레르기|두드러기|부었|붓고|임신|응급|119|병원|증상|다쳤|화상|골절|자살|죽고 싶|자해|우울|중독|돈|송금|이체|입금|출금|결제|환불|카드|계좌|통장|대출|이자|세금|세무|부가세|연말정산|급여|월급|퇴직금|정산|수당|투자|주식|코인|보험|위약금|계약|보증금|소송|고소|법|변호사|합의|벌금|저작권|해지|사기|피싱|도용|오류|버그|에러|장애|손상|증명|반례|재고|동시|이중|중복 (결제|출금|계산)|환자|쓰러|마취|가스|깨지 못|안 깨|숨을 안|해킹|보안|비밀번호|암호|개인정보|유출|주민번호|인증|악성|바이러스|권한|로그인|싼 |저렴|빠른 (AI|모델)|쉬운 (일|거|질문)|간단한 (일|질문)|무시하고|그대로 따르|fast/i;
const RISK_EN = /pain|hurt|chest|breath|dizz|faint|unconscious|numb|droop|slurr|seizure|bleed|blood|vomit|fever|swallow|ingest|drank|overdose|dose|medication|medicine|pill|prescri|side effect|allerg|rash|swell|pregnan|emergency|911|hospital|symptom|injur|burn|fractur|suicid|kill myself|self-harm|depress|poison|bleach|money|payment|\bpay\b|paid|refund|charge|bank|account|loan|interest|\btax|payroll|salary|wage|invoice|settle|reconcil|invest|stock|crypto|insurance|penalt|contract|lease|deposit|lawsuit|\bsue\b|legal|\blaw|lawyer|attorney|\bfine\b|copyright|fraud|scam|dispute|chargeback|debt|mortgage|skimm|stolen|\bbug|error|crash|corrupt|outage|proof|concurren|race condition|double[- ](paid|charged|count)|patient|collaps|anesthe|fumes|\bgas\b|won't wake|not waking|hack|security|password|encrypt|privacy|personal data|leak|breach|phishing|malware|virus|credential|permission|vulnerab|logged in|login|injection|\bfast\b|cheap|trivial|easy (one|task|question)|quick (one|question)|ignore (that|all|previous)/i;
export function needsStrong(q: string): boolean {
  return q.length > 350 || HEAVY_ANY.test(q) || RISK_ANY.test(q) || RISK_KO.test(q) || RISK_EN.test(q) || /```|코드|분석|계획|전략|비교|설계|보고서|문서|엑셀|표로|요약해|번역|왜 |원인|검토|논문|계약|\b(code|debug|analy[sz]e|plan|strategy|compare|design|report|spreadsheet|summari[sz]e|translate|why|review|contract|essay|proof)\b/i.test(q);
}
export function autoModel(keys: Partial<Record<Provider, string>>, question: string, strong: boolean = needsStrong(question)): string | null {
  for (const p of ORDER) {
    if (!keys[p]) continue;
    return strong ? STRONG[p] ?? MODELS[p][0]!.id : (MODELS[p].find((m) => m.fast) ?? MODELS[p][0]!).id;
  }
  return null;
}

/** A cheap, fast model on whichever provider the user has — for judging/picking. */
export function fastModel(keys: Partial<Record<Provider, string>>): string | null {
  for (const p of ORDER) if (keys[p]) return (MODELS[p].find((m) => m.fast) ?? MODELS[p][0]!).id;
  return null;
}

/** Member tools for this answer (lib/tools): the definitions, how to run one (API keys — in this request), a signed ticket
 *  (Claude plans — the worker calls back), and where to show «using the computer…» while it runs. */
export type ToolUse = { defs: ToolDef[]; run: (name: string, args: unknown) => Promise<string>; ticket: string; onStatus?: (tool: string) => void };
/** noTrain: the request holds Google data — on OpenRouter only providers that don't store or train on it (lib/google-safe.ts). */
type StreamOpts = { model: string; key: string; system: string; messages: ChatMsg[]; maxTokens?: number; signal?: AbortSignal; webSearch?: boolean; searches?: number; timeoutMs?: number; tools?: ToolUse; noTrain?: boolean; connectors?: boolean; side?: boolean; turn?: string;
  /** A web search started (no member tools — with them, tools.onStatus hears it): «Searching the web…» (lib/search-status.ts). */
  onStatus?: (tool: string) => void };
const TOOL_ROUNDS = 40;

/** Provider-shaped message content: text only, or text + images (vision). */
function anthropicMsgs(ms: ChatMsg[]) {
  return ms.map((m) => m.images?.length
    ? { role: m.role, content: [...m.images.map((i) => ({ type: "image", source: { type: "base64", media_type: i.mime, data: i.b64 } })), { type: "text", text: m.content }] }
    : { role: m.role, content: m.content });
}
function openaiMsgs(ms: ChatMsg[]) {
  return ms.map((m) => m.images?.length
    ? { role: m.role, content: [{ type: "text", text: m.content }, ...m.images.map((i) => ({ type: "image_url", image_url: { url: `data:${i.mime};base64,${i.b64}` } }))] }
    : { role: m.role, content: m.content });
}

/** Streams text deltas. Yields plain text pieces. */
export async function* streamChat(o: StreamOpts): AsyncGenerator<string> {
  const p = providerOf(o.model);
  // A Gemini/OpenAI/Grok key with search on: the company's own search answers. Refused (model or plan without search) → the usual
  // answer, told it can't browse so it doesn't pass off memory as a fresh search.
  if (o.webSearch && isSearchKey(p)) {
    if (yield* keySearch(o, p)) return;
    o = { ...o, webSearch: false, system: `${o.system}\n\nWeb search could not run in this turn, so you cannot browse now. If the question needs current facts, say you couldn't search.` };
  }
  // With member tools: the Claude plan gets them through the worker's MCP bridge; API keys and Unchore credit run the tool loop here.
  // ChatGPT plans have no tool bridge yet — they answer without tools.
  if (o.tools && p === "claude_sub") {
    yield* subChat({ userId: o.key, model: o.model.slice(4), system: o.system, messages: o.messages, signal: o.signal, timeoutMs: o.timeoutMs, plan: "claude", webSearch: o.webSearch, connectors: o.connectors,
      tools: o.tools.defs, toolToken: o.tools.ticket, onStatus: o.tools.onStatus, turn: o.turn });
    return;
  }
  if (o.tools && p === "anthropic") { yield* anthropicLoop(o); return; }
  if (o.tools && p !== "chatgpt_sub") { yield* openaiLoop(o, p); return; }
  // Attached pictures go to the plan too (they used to be dropped here, so a plan answer said «I can't see the image» · 2026-10-01).
  // Codex has no system slot or prompt cache, so the cache marker line is taken out for it (AI Soul worker/engines/codex.ts codexPrompt).
  if (p === "claude_sub" || p === "chatgpt_sub") { yield* subChat({ userId: o.key, model: o.model.slice(p === "claude_sub" ? 4 : 3), system: p === "chatgpt_sub" ? stripPromptBoundary(o.system) : o.system, messages: o.messages, signal: o.signal, timeoutMs: o.timeoutMs, plan: p === "claude_sub" ? "claude" : "chatgpt", webSearch: o.webSearch, connectors: o.connectors, side: o.side, turn: o.turn, onStatus: o.onStatus }); return; }
  let res: Response;
  if (p === "anthropic") {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal: o.signal,
      headers: { "x-api-key": o.key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: o.model, max_tokens: o.maxTokens ?? 8192, system: anthropicSystem(o.system), messages: anthropicMsgs(o.messages), stream: true,
        ...(o.webSearch ? { tools: [{ type: /haiku|fable/.test(o.model) ? "web_search_20250305" : "web_search_20260209", name: "web_search", max_uses: o.searches ?? 5 }] } : {}) }),
    });
  } else if (isCompat(p)) {
    const call = (name: string) => fetch(`${COMPAT[p].base}/chat/completions`, {
      method: "POST", signal: o.signal, headers: { Authorization: `Bearer ${o.key}`, "content-type": "application/json" },
      body: JSON.stringify({ model: name, stream: true, messages: [{ role: "system", content: stripPromptBoundary(o.system) }, ...openaiMsgs(o.messages)] }),
    });
    const name = o.model.slice(p.length + 1);
    res = await call(knownName.get(o.model) ?? name);
    if (!res.ok && (res.status === 404 || res.status === 400)) {
      const t = await res.text().catch(() => "");
      const other = /model/i.test(t) ? await compatModel(p, o.key, name) : null;
      if (other) { knownName.set(o.model, other); res = await call(other); } else throw new AiError(res.status, t.slice(0, 400));
    }
  } else {
    const credit = p === "credit";
    const url = p === "openai" ? "https://api.openai.com/v1/chat/completions" : "https://openrouter.ai/api/v1/chat/completions";
    const headers: Record<string, string> = { Authorization: `Bearer ${credit ? houseKey() : o.key}`, "content-type": "application/json" };
    if (p !== "openai") { headers["HTTP-Referer"] = "https://unchore.ai"; headers["X-Title"] = "Unchore"; }
    res = await fetch(url, {
      method: "POST", signal: o.signal, headers,
      body: JSON.stringify({ model: credit ? o.model.slice(3) : o.model, stream: true, messages: [{ role: "system", content: stripPromptBoundary(o.system) }, ...openaiMsgs(o.messages)],
        ...(o.webSearch && p !== "openai" ? { plugins: [{ id: "web", max_results: o.searches ?? 5 }] } : {}),
        // On Unchore's account: OpenRouter reports what the call cost, and no provider may keep the member's words for training.
        // Google data on the member's own OpenRouter key: the same «deny» (lib/google-safe.ts).
        ...(credit ? { usage: { include: true } } : {}), ...(credit || (o.noTrain && p === "openrouter") ? { provider: { data_collection: "deny" } } : {}) }),
    });
    // Unchore's own OpenRouter balance ran out: not the member's fault, so not «top up on the provider's site».
    if (credit && res.status === 402) { console.warn("Unchore house OpenRouter account is out of credit"); throw new AiError(503, "house account out of credit"); }
  }
  if (!res.ok || !res.body) {
    const t = await res.text().catch(() => "");
    throw new AiError(res.status, t.slice(0, 400));
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", cost = 0, said = "";
  const srcs: Src[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const j = JSON.parse(data);
          if (p === "credit" && typeof j.usage?.cost === "number") cost = j.usage.cost;
          if (p === "anthropic" && j.type === "content_block_start" && j.content_block?.type === "server_tool_use") o.onStatus?.(j.content_block.name);
          const piece = p === "anthropic"
            ? (j.type === "content_block_delta" && j.delta?.type === "text_delta" ? j.delta.text : "")
            : (j.choices?.[0]?.delta?.content ?? "");
          if (o.webSearch) srcs.push(...eventSources(j));
          if (piece) { said += piece; yield piece as string; }
        } catch { /* keep-alive or partial line */ }
      }
    }
    const f = said ? sourcesFooter(said, srcs) : "";
    if (f) yield f;
  } finally {
    // Runs on Stop too. A cut stream may end before OpenRouter's closing cost line, and then nothing is charged.
    if (cost > 0) await charge(o.key, cost, `Chat · ${o.model.slice(3)}`).catch((e) => console.warn(`credit charge failed: ${(e as Error).message}`));
  }
}

async function post(url: string, headers: Record<string, string>, body: unknown, signal?: AbortSignal): Promise<Response> {
  const res = await fetch(url, { method: "POST", signal, headers, body: JSON.stringify(body) });
  if (!res.ok || !res.body) {
    const t = await res.text().catch(() => "");
    throw new AiError(res.status, t.slice(0, 400));
  }
  return res;
}

/** Server-sent events → one parsed JSON object per `data:` line. */
async function* sse(res: Response): AsyncGenerator<Record<string, any>> {  // eslint-disable-line @typescript-eslint/no-explicit-any
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try { yield JSON.parse(data); } catch { /* keep-alive or partial line */ }
    }
  }
}

/** Search on the member's Gemini/OpenAI/Grok key (lib/key-search.ts). False when the company refused before writing anything. */
async function* keySearch(o: StreamOpts, p: SearchKeyProvider): AsyncGenerator<string, boolean> {
  const r = searchRequest(p, o.key, knownName.get(o.model) ?? (p === "openai" ? o.model : o.model.slice(p.length + 1)), o.system, o.messages);
  const res = await fetch(r.url, { method: "POST", signal: o.signal, headers: r.headers, body: JSON.stringify(r.body) });
  if (!res.ok || !res.body) { console.warn(`web search on a ${p} key refused (${res.status}): ${(await res.text().catch(() => "")).slice(0, 200)}`); return false; }
  const sources: Parameters<typeof sourcesLine>[0] = [];
  let wrote = false;
  for await (const j of sse(res)) {
    const e = readEvent(p, j);
    if (e.error && !wrote) { console.warn(`web search on a ${p} key failed: ${e.error.slice(0, 200)}`); return false; }
    if (e.error) throw new AiError(502, e.error.slice(0, 400));
    sources.push(...e.sources);
    if (e.text) { wrote = true; yield e.text; }
  }
  if (wrote) { const s = sourcesLine(sources); if (s) yield s; }
  return wrote;
}

/** Some models can't use tools (the company says so in a 400/404) — then answer once without them. */
const noToolSupport = (e: unknown) => e instanceof AiError && [400, 404].includes(e.status) && /tool/i.test(e.detail);
/** OpenAI's newest models take function tools on /v1/chat/completions only with reasoning_effort «none» (gpt-6-sol, 2026-10-02:
 *  «Function tools with reasoning_effort are not supported … set reasoning_effort to 'none'»). Read as «no tools» before, so members
 *  on an OpenAI key never got their tools — now the call is repeated with tools and that setting. */
export const toolsNeedNoReasoning = (e: unknown) => e instanceof AiError && e.status === 400 && /reasoning_effort/i.test(e.detail) && /tool/i.test(e.detail);

/** Anthropic key with member tools: each tool call runs, its result goes back, and the AI continues (up to TOOL_ROUNDS rounds). */
async function* anthropicLoop(o: StreamOpts): AsyncGenerator<string> {
  const headers = { "x-api-key": o.key, "anthropic-version": "2023-06-01", "content-type": "application/json" };
  const search = o.webSearch ? [{ type: /haiku|fable/.test(o.model) ? "web_search_20250305" : "web_search_20260209", name: "web_search", max_uses: o.searches ?? 5 }] : [];
  const mine = (o.tools?.defs ?? []).map((d) => ({ name: d.name, description: d.description, input_schema: d.parameters }));
  const msgs: Array<{ role: string; content: unknown }> = anthropicMsgs(o.messages);
  const srcs: Src[] = [];
  let said = "";
  for (let round = 0; ; round++) {
    const useTools = mine.length > 0 && round < TOOL_ROUNDS;
    const tools = [...search, ...(useTools ? mine : [])];
    const res = await post("https://api.anthropic.com/v1/messages", headers,
      { model: o.model, max_tokens: o.maxTokens ?? 8192, system: anthropicSystem(o.system), messages: msgs, stream: true, ...(tools.length ? { tools } : {}) }, o.signal);
    // Rebuild the whole assistant turn (text, web-search blocks, tool calls) — it must go back unchanged with the tool results.
    const blocks: Array<Record<string, any>> = [];  // eslint-disable-line @typescript-eslint/no-explicit-any
    const json: string[] = [];
    let stop = "";
    for await (const j of sse(res)) {
      if (j.type === "content_block_start") { blocks[j.index] = { ...j.content_block }; json[j.index] = ""; if (j.content_block?.type === "tool_use" || j.content_block?.type === "server_tool_use") o.tools?.onStatus?.(j.content_block.name); }
      else if (j.type === "content_block_delta") {
        const b = blocks[j.index];
        if (!b) continue;
        if (j.delta?.type === "text_delta") { b.text = (b.text ?? "") + j.delta.text; said += j.delta.text; yield j.delta.text as string; }
        else if (j.delta?.type === "input_json_delta") json[j.index] += j.delta.partial_json ?? "";
        else if (j.delta?.type === "citations_delta") { (b.citations ??= []).push(j.delta.citation); srcs.push(...eventSources(j)); }
      } else if (j.type === "content_block_stop") {
        const b = blocks[j.index];
        if (b && (b.type === "tool_use" || b.type === "server_tool_use")) { try { b.input = json[j.index] ? JSON.parse(json[j.index]!) : {}; } catch { b.input = {}; } }
      } else if (j.type === "message_delta" && j.delta?.stop_reason) stop = j.delta.stop_reason;
    }
    const calls = blocks.filter((b) => b?.type === "tool_use");
    if (stop !== "tool_use" || !calls.length || !o.tools) { const f = said ? sourcesFooter(said, srcs) : ""; if (f) yield f; return; }
    msgs.push({ role: "assistant", content: blocks.filter(Boolean) });
    const results = [];
    for (const c of calls) results.push({ type: "tool_result", tool_use_id: c.id, content: await o.tools.run(c.name, c.input) });
    msgs.push({ role: "user", content: results });
    if (blocks.some((b) => b?.type === "text" && b.text)) yield "\n\n";
  }
}

/** OpenAI-shaped companies (OpenAI, OpenRouter, Unchore credit, Gemini/xAI/DeepSeek/Kimi) with member tools. Credit answers are
 *  charged round by round from OpenRouter's own cost line, as the plain path does. */
async function* openaiLoop(o: StreamOpts, p: Provider): AsyncGenerator<string> {
  const credit = p === "credit";
  const url = isCompat(p) ? `${COMPAT[p].base}/chat/completions` : p === "openai" ? "https://api.openai.com/v1/chat/completions" : "https://openrouter.ai/api/v1/chat/completions";
  const headers: Record<string, string> = { Authorization: `Bearer ${credit ? houseKey() : o.key}`, "content-type": "application/json" };
  if (p === "openrouter" || credit) { headers["HTTP-Referer"] = "https://unchore.ai"; headers["X-Title"] = "Unchore"; }
  const model = credit ? o.model.slice(3) : isCompat(p) ? knownName.get(o.model) ?? o.model.slice(p.length + 1) : o.model;
  const fns = (o.tools?.defs ?? []).map((d) => ({ type: "function", function: { name: d.name, description: d.description, parameters: d.parameters } }));
  const msgs: Array<Record<string, unknown>> = [{ role: "system", content: stripPromptBoundary(o.system) }, ...openaiMsgs(o.messages)];
  let toolsOk = fns.length > 0, noReasoning = false, said = "";
  const srcs: Src[] = [];
  for (let round = 0; ; round++) {
    const useTools = toolsOk && round < TOOL_ROUNDS;
    const body = { model, stream: true, messages: msgs, ...(useTools ? { tools: fns } : {}), ...(useTools && noReasoning ? { reasoning_effort: "none" } : {}),
      ...(o.webSearch && (p === "openrouter" || credit) ? { plugins: [{ id: "web", max_results: o.searches ?? 5 }] } : {}),
      ...(credit ? { usage: { include: true } } : {}), ...(credit || (o.noTrain && p === "openrouter") ? { provider: { data_collection: "deny" } } : {}) };
    let res: Response;
    try { res = await post(url, headers, body, o.signal); }
    catch (e) {
      if (credit && e instanceof AiError && e.status === 402) { console.warn("Unchore house OpenRouter account is out of credit"); throw new AiError(503, "house account out of credit"); }
      if (useTools && round === 0 && !noReasoning && toolsNeedNoReasoning(e)) { noReasoning = true; round--; continue; }
      if (useTools && round === 0 && noToolSupport(e)) { toolsOk = false; round--; continue; }
      throw e;
    }
    let text = "", cost = 0, finish = "";
    const calls: Array<{ id: string; name: string; args: string }> = [];
    try {
      for await (const j of sse(res)) {
        if (credit && typeof j.usage?.cost === "number") cost = j.usage.cost;
        const ch = j.choices?.[0];
        const piece = ch?.delta?.content;
        if (o.webSearch) srcs.push(...eventSources(j));
        if (piece) { text += piece; said += piece; yield piece as string; }
        for (const t of ch?.delta?.tool_calls ?? []) {
          const c = (calls[t.index ?? 0] ??= { id: "", name: "", args: "" });
          if (t.id) c.id = t.id;
          if (t.function?.name) { c.name += t.function.name; o.tools?.onStatus?.(c.name); }
          if (t.function?.arguments) c.args += t.function.arguments;
        }
        if (ch?.finish_reason) finish = ch.finish_reason;
      }
    } finally {
      if (cost > 0) await charge(o.key, cost, `Chat · ${model}`).catch((e) => console.warn(`credit charge failed: ${(e as Error).message}`));
    }
    const got = calls.filter((c) => c && c.name);
    if (!got.length || !o.tools || finish === "length") { const f = said ? sourcesFooter(said, srcs) : ""; if (f) yield f; return; }
    msgs.push({ role: "assistant", content: text || null, tool_calls: got.map((c, i) => ({ id: c.id || `call_${round}_${i}`, type: "function", function: { name: c.name, arguments: c.args || "{}" } })) });
    for (const [i, c] of got.entries()) {
      let args: unknown = {};
      try { args = c.args ? JSON.parse(c.args) : {}; } catch { /* the tool reports the bad input */ }
      msgs.push({ role: "tool", tool_call_id: c.id || `call_${round}_${i}`, content: await o.tools.run(c.name, args) });
    }
    if (text) yield "\n\n";
  }
}

/** Our model name → the name the company answered to after a retired one (kept while this server runs). */
const knownName = new Map<string, string>();

/** The company's model list (GET /models) — answers 200 only to a working key, so it also tells which company a key is from. */
export async function listModels(p: CompatProvider | "openai", key: string): Promise<string[] | null> {
  const base = p === "openai" ? "https://api.openai.com/v1" : COMPAT[p].base;
  const r = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!r?.ok) return null;
  const j = (await r.json().catch(() => null)) as { data?: { id?: string }[] } | null;
  return (j?.data ?? []).map((m) => String(m.id ?? "").replace(/^models\//, "")).filter(Boolean);
}

/** A stand-in when the company no longer knows `wanted`: the same kind (pro/flash) first, newest-looking name. */
export function pickStandIn(p: CompatProvider, ids: string[], wanted: string): string | null {
  const fam = ids.filter((id) => COMPAT[p].family.test(id) && id !== wanted);
  if (!fam.length) return null;
  const kind = /pro|flash/.exec(wanted)?.[0];
  const same = kind ? fam.filter((id) => id.includes(kind)) : fam;
  return (same.length ? same : fam).sort((a, b) => b.localeCompare(a, "en", { numeric: true }))[0]!;
}

async function compatModel(p: CompatProvider, key: string, wanted: string): Promise<string | null> {
  const ids = await listModels(p, key);
  return ids ? pickStandIn(p, ids, wanted) : null;
}

export class AiError extends Error {
  constructor(public status: number, public detail: string) {
    super(`AI provider error ${status}`);
  }
}

/** What the member reads when their AI company refuses (raw provider JSON used to be shown as the answer). The code stays at the end for support. */
export function aiErrorMessage(status: number, lang: string): string {
  const why = status === 401 || status === 403
    ? (tr(lang, "Your AI key didn't work, so no answer came back. Paste a new key here and I'll switch to it."))
    : status === 402
      ? (tr(lang, "Your AI account is out of credit. Top it up on the provider's site, then send again."))
      : status === 429
        ? (tr(lang, "The AI company is limiting requests right now. Please send again in a moment."))
        : status >= 500
          ? (tr(lang, "The AI company had a hiccup. Please send again shortly."))
          : (tr(lang, "The AI company didn't accept this request. Try again, or tap the AI name under the box to pick another."));
  return `${why} (${tr(lang, "error {code}", { code: status })})`;
}

/** Worth trying the member's other connection? Only for «this connection can't answer right now»: a Claude plan at its limit or
 *  signed out or turned off by their company, a key refused, out of credit, rate-limited, or the AI company down (ported from AI Soul worker/answer.ts). */
export function canFallBack(e: unknown): boolean {
  // 400/404 too (AI Soul lib/routing.ts): a model this connection no longer has, or a request this AI won't take (a picture it can't
  // read), may well work on the member's other connection — only «the question is too long» fails the same everywhere.
  if (e instanceof AiError) return [401, 402, 403, 429].includes(e.status) || e.status >= 500 || ([400, 404].includes(e.status) && !TOO_LONG.test(e.detail));
  // An error never seen before («other») may be this connection's own trouble, so the next one is tried too — only «the question is too long»
  // fails the same everywhere (AI Soul worker/failover-rule.ts, 2026-10-02: an unknown error is not taken to mean every AI is down).
  return e instanceof SubError && (["limit", "signed_out", "blocked", "busy", "other", ...WORKER_TROUBLE].includes(e.why) || /^worker_5/.test(e.why));
}

/** The plan worker couldn't be reached, restarted under the answer, or its program didn't start — the plan itself may be fine
 *  (2026-10-03 01:29: the worker restarted and two reminders ended in «클로드 요금제로 답하지 못했어요» with no second try). */
const WORKER_TROUBLE = ["worker_unreachable", "worker_cut", "warm_init"];

/** No other connection to move to, but a passing hiccup (Claude/ChatGPT plan busy, an unknown plan error, the worker's 5xx, or the
 *  AI company's 5xx/429): worth asking the same connection once more after a short wait instead of telling the member to send again
 *  (2026-10-02 · «클로드 요금제로 답하지 못했어요. 잠시 뒤 다시 해 주세요» ended a member's question). Limits, sign-outs and refusals are not retried. */
export function canRetrySame(e: unknown): boolean {
  if (e instanceof AiError) return e.status === 429 || e.status >= 500;
  return e instanceof SubError && (["busy", "other", ...WORKER_TROUBLE].includes(e.why) || /^worker_5/.test(e.why));
}

const TOO_LONG = /too long|context length|maximum context|too many tokens/i;

/** The member's next connection that hasn't been tried in this answer (their order: plan, Anthropic, OpenAI, OpenRouter, Unchore credit), its main model.
 *  With pictures in the chat, only a model that can see them. */
export function fallbackModel(keys: Partial<Record<Provider, string>>, tried: string[], pictures = false): string | null {
  const used = new Set(tried.map(providerOf));
  for (const p of ORDER) {
    const m = keys[p] && !used.has(p) ? MODELS[p].find((x) => !pictures || seesImages(x.id)) : undefined;
    if (m) return m.id;
  }
  return null;
}

/** A turn nobody watches (a reminder, a background job) works with tools — the computer, the browser — and a ChatGPT plan has no
 *  tool bridge yet (streamChat), so it would answer without them: 2026-10-03 07:55 the build-diary reminder fell back to cx:gpt-6-sol,
 *  said «the computer tool isn't connected» and posted nothing. The connections without that plan; only that plan → unchanged. */
export function toolKeys(keys: Partial<Record<Provider, string>>): Partial<Record<Provider, string>> {
  const rest: Partial<Record<Provider, string>> = { ...keys };
  delete rest.chatgpt_sub;
  return Object.values(rest).some(Boolean) ? rest : keys;
}

/** The AI for such a turn: a ChatGPT-plan pick becomes the strong model of the first connection that takes tools
 *  (Claude plan → Anthropic key → … → OpenRouter → … → Unchore credit); any other pick stays. */
export function toolModel(keys: Partial<Record<Provider, string>>, model: string, question: string): string {
  return providerOf(model) === "chatgpt_sub" ? autoModel(toolKeys(keys), question, true) ?? model : model;
}

/** DeepSeek and GLM read text only: a picture sent to them came back as an error and no answer (AI Soul lib/routing.ts ENGINE_ACCEPTS). */
export const seesImages = (model: string): boolean => !/deepseek|(^|[/:])z-ai\/|glm-/i.test(model);

/** A model that can see pictures for a chat that has some: the same connection's own one first, then the member's other connections. */
export function visionModel(keys: Partial<Record<Provider, string>>, model: string): string | null {
  const p = providerOf(model);
  const same = MODELS[p].find((x) => seesImages(x.id));
  return same ? same.id : fallbackModel(keys, [model], true);
}

/** Side jobs (title, memory, notes, summary): when the first connection fails for its own reasons (limit, signed out, blocked),
 *  try the member's next connection's fast model once instead of silently skipping. Never falls to Unchore credit — a side job
 *  should not spend credit the member didn't choose for it (AI Soul f7248c4: night grading stopped on one blocked account). */
export function nextFastModel(keys: Partial<Record<Provider, string>>, tried: string[]): string | null {
  const used = new Set(tried.map(providerOf));
  for (const p of PROVIDERS) if (keys[p] && !used.has(p)) return (MODELS[p].find((m) => m.fast) ?? MODELS[p][0]!).id;
  return null;
}
/** «side»: on a Claude/ChatGPT plan it takes the worker's side seats, never a member's answer seat (worker/slots.mjs). */
export async function completeSide(keys: Partial<Record<Provider, string>>, o: Omit<StreamOpts, "key">): Promise<string> {
  try { return await complete({ ...o, side: true, key: keys[providerOf(o.model)]! }); }
  catch (e) {
    const alt = canFallBack(e) && !o.signal?.aborted ? nextFastModel(keys, [o.model]) : null;
    if (!alt) throw e;
    return complete({ ...o, side: true, model: alt, key: keys[providerOf(alt)]! });
  }
}

/** One-shot completion (collects the stream). */
export async function complete(o: StreamOpts): Promise<string> {
  let out = "";
  for await (const piece of streamChat(o)) out += piece;
  return out;
}

/** Pull the first JSON object out of a model reply (models sometimes wrap it in ``` fences). */
export function firstJson<T>(s: string): T | null {
  const t = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const m = t.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]) as T; } catch { return null; }
}
