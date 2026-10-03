// Web search on a member's own Gemini, OpenAI or Grok key (2026-10-02, from the AI Soul survey of 2026-10-01: these keys answered
// «I can't browse» while the same companies search for their own apps). Gemini searches Google through its own API (google_search),
// OpenAI and xAI through their Responses API (web_search tool). The search runs on the member's key and is billed to them — never
// to Unchore. DeepSeek and Kimi offer no web search a plain API call can turn on, so they stay without it.
// A searching turn is answered by the search alone (no member tools in that turn): the member turned search on for it.
import { stripPromptBoundary } from "./prompt-boundary";
import type { ChatMsg } from "./ai";

export type SearchKeyProvider = "gemini" | "openai" | "xai";
export const SEARCH_KEY_PROVIDERS: readonly SearchKeyProvider[] = ["gemini", "openai", "xai"];

type Req = { url: string; headers: Record<string, string>; body: Record<string, unknown> };
export type Src = { url: string; title: string };

/** The request that answers with web search, in the company's own format. `name` is the model name at that company. */
export function searchRequest(p: SearchKeyProvider, key: string, name: string, system: string, messages: ChatMsg[]): Req {
  const sys = stripPromptBoundary(system);
  if (p === "gemini") return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(name)}:streamGenerateContent?alt=sse`,
    headers: { "x-goog-api-key": key, "content-type": "application/json" },
    body: { systemInstruction: { parts: [{ text: sys }] }, tools: [{ google_search: {} }],
      contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user",
        parts: [...(m.images ?? []).map((i) => ({ inline_data: { mime_type: i.mime, data: i.b64 } })), { text: m.content || " " }] })) },
  };
  return {
    url: p === "openai" ? "https://api.openai.com/v1/responses" : "https://api.x.ai/v1/responses",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: { model: name, stream: true, store: false, tools: [{ type: "web_search" }],
      input: [{ role: "system", content: sys }, ...messages.map((m) => m.role === "user" && m.images?.length
        ? { role: "user", content: [{ type: "input_text", text: m.content }, ...m.images.map((i) => ({ type: "input_image", image_url: `data:${i.mime};base64,${i.b64}` }))] }
        : { role: m.role, content: m.content })] },
  };
}

/** One streamed event → the text in it, the sources it names, and an error the company reported mid-answer. */
export function readEvent(p: SearchKeyProvider, j: Record<string, any>): { text: string; sources: Src[]; error?: string } {  // eslint-disable-line @typescript-eslint/no-explicit-any
  if (p === "gemini") {
    const c = j.candidates?.[0];
    const text = (c?.content?.parts ?? []).filter((x: { thought?: boolean }) => !x.thought).map((x: { text?: string }) => x.text ?? "").join("");
    const sources = (c?.groundingMetadata?.groundingChunks ?? []).map((g: { web?: { uri?: string; title?: string } }) => ({ url: g.web?.uri ?? "", title: g.web?.title ?? "" }));
    return { text, sources: sources.filter((s: Src) => s.url), ...(j.error ? { error: String(j.error.message ?? "error") } : {}) };
  }
  if (j.type === "response.output_text.delta") return { text: String(j.delta ?? ""), sources: [] };
  if (j.type === "response.output_text.annotation.added" && j.annotation?.type === "url_citation" && j.annotation.url) return { text: "", sources: [{ url: j.annotation.url, title: j.annotation.title ?? "" }] };
  if (j.type === "error" || j.type === "response.failed") return { text: "", sources: [], error: String(j.message ?? j.response?.error?.message ?? "error") };
  return { text: "", sources: [] };
}

/** The sources the search used, as links under the answer (each address once, at most 8). Empty when there were none. */
export function sourcesLine(sources: Src[]): string {
  const seen = new Set<string>();
  const list = sources.filter((s) => /^https?:\/\//.test(s.url) && !seen.has(s.url) && seen.add(s.url)).slice(0, 8);
  return list.length ? `\n\n🔎 ${list.map((s) => `[${(s.title || new URL(s.url).hostname).replace(/[[\]]/g, "")}](${s.url})`).join(" · ")}` : "";
}

/** Sources named in one streamed event of the other web-search paths: Anthropic's search citations and OpenRouter's web plugin
 *  annotations (both were read and dropped before, so those answers came without a single link · AI Soul worker/websearch.ts). */
export function eventSources(j: Record<string, any>): Src[] {  // eslint-disable-line @typescript-eslint/no-explicit-any
  if (j.type === "content_block_delta" && j.delta?.type === "citations_delta") return j.delta.citation?.url ? [{ url: j.delta.citation.url, title: j.delta.citation.title ?? "" }] : [];
  const ch = j.choices?.[0];
  return [...(ch?.delta?.annotations ?? []), ...(ch?.message?.annotations ?? [])]
    .filter((a) => a?.type === "url_citation" && a.url_citation?.url).map((a) => ({ url: a.url_citation.url, title: a.url_citation.title ?? "" }));
}

/** The source links under a searched answer — only when the answer itself links none of them (no sources twice, no claim without one). */
export function sourcesFooter(answer: string, sources: Src[]): string {
  return sources.some((s) => answer.includes(s.url)) ? "" : sourcesLine(sources);
}
