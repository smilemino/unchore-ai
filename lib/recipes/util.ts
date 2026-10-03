import type { Lang } from "@/lib/i18n";
export const UA = "Mozilla/5.0 (compatible; UnchoreBot/0.1; +https://unchore.ai/bot)";

export async function getJson<T>(url: string, f: typeof fetch = fetch, headers: Record<string, string> = {}): Promise<T> {
  const r = await f(url, { headers: { "User-Agent": UA, Accept: "application/json", ...headers }, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} from ${new URL(url).host}`);
  return (await r.json()) as T;
}

export async function getText(url: string, f: typeof fetch = fetch): Promise<string> {
  const r = await f(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} from ${new URL(url).host}`);
  return await r.text();
}

export function fmt(n: number, lang: Lang, digits = 2): string {
  return n.toLocaleString(lang, { maximumFractionDigits: digits });
}

/** Very small HTML → text: drop scripts/styles/tags, decode common entities, keep line breaks at block ends. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6])[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
}

export function decodeXml(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}
