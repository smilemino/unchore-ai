// Recordings and YouTube links become words the member's AI can read (2026-10-02 owner: «don't say it can't — make it work»;
// the «I can't» answers lib/gaps.ts caught were «transcribe this recording» and «read this YouTube video»).
//  - An attached sound or video file: speech to text on Unchore's worker (faster-whisper there — the sound never leaves us).
//  - A YouTube link in the question: the video's captions from the worker (free); where YouTube turns the worker away, Gemini
//    reads the link itself — first on Unchore's free-tier Gemini key (no billing on its project, so it can't cost anything; Google:
//    «free tier: 8 hours of YouTube a day»; only the link and a fixed line go, never the member's words; free tier is off for
//    Europe — Google terms), then the member's own Gemini or OpenRouter key, else on Unchore credit they bought (never ours).
import { charge, houseKey } from "./credits";
import { userKeys } from "./ai";
import { one } from "./db";
import { PART_BYTES } from "./upload-limits";

export type Words = { text: string; title?: string; seconds?: number; source: string; cut?: boolean };
const worker = () => (process.env.BROWSER_WORKER_URL ?? "").replace(/\/$/, "");

async function onWorker(path: string, body: unknown, ms: number): Promise<Record<string, unknown> | null> {
  if (!worker()) return null;
  const r = await fetch(worker() + path, {
    method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
    body: JSON.stringify({ ...(body as object), ms: ms - 5_000 }), signal: AbortSignal.timeout(ms),
  }).catch(() => null);
  const j = r ? ((await r.json().catch(() => null)) as Record<string, unknown> | null) : null;
  return j?.ok ? j : null;
}

/** Speech in an attached sound or video → text, or null when it couldn't be done. */
export async function speechWords(data: Buffer, ms = 240_000): Promise<Words | null> {
  const j = await onWorker("/speech", { b64: data.toString("base64") }, ms);
  return j && typeof j.text === "string" ? { text: j.text, seconds: Number(j.seconds) || 0, source: "speech to text", cut: j.cut === true } : null;
}

/** The same for a file over 50 MB: the worker fetches its pieces one by one (lib/big-files.ts) — still the first 20 minutes. */
export async function speechWordsBig(uploadId: string, size: number, ms = 270_000): Promise<Words | null> {
  const j = await onWorker("/speech", { pieces: { id: uploadId, n: Math.ceil(size / PART_BYTES) } }, ms);
  return j && typeof j.text === "string" ? { text: j.text, seconds: Number(j.seconds) || 0, source: "speech to text", cut: j.cut === true } : null;
}

/** YouTube watch, short, live and youtu.be links in a message (at most `max`). */
export function youtubeLinks(text: string, max = 2): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?[^\s<>"']*v=|shorts\/|live\/|embed\/)|youtu\.be\/)([\w-]{11})[^\s<>"']*/g)) {
    const url = `https://www.youtube.com/watch?v=${m[1]}`;
    if (!out.includes(url)) out.push(url);
    if (out.length >= max) break;
  }
  return out;
}

const ASK = "Write out the spoken words of this video in their original language, as plain text, nothing else. If nobody speaks, describe what is shown in a few lines.";
type Route = { url: string; key: string; model: string; extra: Record<string, unknown>; paid: string | null };

/** Google's terms keep the free tier from users in the EEA, Switzerland and the UK — any European time zone counts (safe side). */
export const freeTierOk = (tz: string | null | undefined) => !/^(Europe\/|Atlantic\/(Reykjavik|Faroe|Madeira|Canary|Azores)$)/.test(tz ?? "");

/** Tried in this order on Google's own door; the next one only when the one before was busy, limited or closed. */
export const GOOGLE_MODELS = ["gemini-flash-latest", "gemini-3.5-flash", "gemini-flash-lite-latest"];
const BUSY = new Set([404, 429, 500, 503]);

/** Gemini on Google AI Studio is the one model that opens a YouTube link (OpenRouter docs: video inputs). */
export function routes(keys: Partial<Record<string, string>>, member: string, tz?: string | null): Route[] {
  const or = "https://openrouter.ai/api/v1/chat/completions", only = { provider: { only: ["google-ai-studio"], allow_fallbacks: false }, usage: { include: true } };
  // Google's own door. Named models close to new keys (gemini-2.5-flash: 404 «no longer available to new users», 2026-10-03) and
  // the free tier gets 503 «high demand» at busy times while other flash models still answer — so each key tries three in turn.
  const g = (m: string) => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, free = process.env.UNCHORE_GEMINI_FREE_KEY;
  const out: Route[] = [];
  for (const key of [free && freeTierOk(tz) ? free : null, keys.gemini ?? null]) {
    if (key) for (const m of GOOGLE_MODELS) out.push({ url: g(m), key, model: m, extra: {}, paid: null });
  }
  if (keys.openrouter) out.push({ url: or, key: keys.openrouter, model: "google/gemini-2.5-flash", extra: only, paid: null });
  if (keys.credit && houseKey()) out.push({ url: or, key: houseKey(), model: "google/gemini-2.5-flash", extra: only, paid: member });
  return out;
}

/** A YouTube video's words. null + why when no route could read it. */
export async function youtubeWords(member: string, url: string, ms = 180_000): Promise<{ words: Words } | { why: "no_route" | "failed" }> {
  const w = await onWorker("/youtube", { url }, Math.min(ms, 90_000));
  if (w && typeof w.text === "string" && w.text.trim()) return { words: { text: w.text, title: String(w.title ?? ""), seconds: Number(w.seconds) || 0, source: String(w.source ?? "captions"), cut: w.cut === true } };
  const u = await one<{ tz: string | null }>("select tz from users where id = $1", [member]).catch(() => null);
  const rs = routes(await userKeys(member), member, u?.tz);
  if (!rs.length) return { why: "no_route" };
  let skipKey: string | null = null;
  for (const r of rs) {
    if (r.key === skipKey) continue;
    const native = r.url.includes("googleapis");   // Google's own door takes a YouTube link as file_data (Gemini API: video understanding)
    const res = await fetch(r.url, {
      method: "POST", signal: AbortSignal.timeout(ms),
      headers: native ? { "x-goog-api-key": r.key, "content-type": "application/json" } : { Authorization: `Bearer ${r.key}`, "content-type": "application/json", "HTTP-Referer": "https://unchore.ai", "X-Title": "Unchore" },
      body: JSON.stringify(native
        ? { contents: [{ parts: [{ file_data: { file_uri: url } }, { text: ASK }] }] }
        : { model: r.model, messages: [{ role: "user", content: [{ type: "text", text: ASK }, { type: "video_url", video_url: { url } }] }], ...r.extra }),
    }).catch(() => null);
    if (!res?.ok) { if (native && res && !BUSY.has(res.status)) skipKey = r.key; continue; }   // a bad key or a video Google won't open: same answer on every model
    const j = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[]; candidates?: { content?: { parts?: { text?: string }[] } }[]; usage?: { cost?: number } } | null;
    const text = (native ? j?.candidates?.[0]?.content?.parts?.map((x) => x.text ?? "").join("") : j?.choices?.[0]?.message?.content)?.trim();
    if (r.paid && j?.usage?.cost) await charge(r.paid, j.usage.cost, "YouTube video read").catch(() => {});
    if (text) return { words: { text, source: "read by Gemini" } };
  }
  return { why: "failed" };
}
