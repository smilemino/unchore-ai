// Short chat titles from the first question (ported from AI Soul title-auto). Runs as soon as the question arrives.
import { completeSide, type Provider } from "./ai";

export function parseTitle(raw: string): string | null {
  const line = raw.split("\n").map((l) => l.trim()).find((l) => l.length > 0);
  if (!line) return null;
  const t = line.replace(/^#{1,6}\s+/, "").replace(/[*_`]/g, "").replace(/^(제목|title)\s*[:：]\s*/i, "")
    .replace(/^["'“”‘’「『《〈]+|["'“”‘’」』》〉]+$/g, "").replace(/[.。!！]+$/, "").replace(/\s+/g, " ").trim();
  return t.length < 2 || t.length > 48 ? null : t;
}

export async function makeTitle(question: string, model: string, keys: Partial<Record<Provider, string>>): Promise<string | null> {
  const raw = await completeSide(keys, {
    model, maxTokens: 40,
    system: "Write a short title (3-7 words) for a chat list, in the same language as the question. Title only — no quotes, no period, no emoji.",
    messages: [{ role: "user", content: `Question:\n${question.slice(0, 2000)}\n\nTitle:` }],
  }).catch(() => "");
  return parseTitle(raw);
}
