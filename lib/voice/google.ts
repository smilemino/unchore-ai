// Google voice for voice mode — reading answers aloud (Gemini 3.8 Flash-Lite TTS, first sound ≈0.8 s) and recognising the
// language of a user's first words (Gemini Flash-Lite listening to a short WAV). The Google key stays on the server;
// the browser only talks to /api/voice/*. Unchore pays for this (owner decision 2026-09-29), so every call is metered per member
// (voice_usage, own time zone) and stops at the daily allowance — the browser then falls back to the phone's own voice.
import { one, q } from "../db";
import { charge, wallet } from "../credits";

export const TTS_MODEL = "gemini-3.8-flash-lite-tts";
export const TTS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions?alt=sse";
export const HEAR_MODEL = "gemini-3.5-flash-lite";
export const HEAR_URL = `https://generativelanguage.googleapis.com/v1beta/models/${HEAR_MODEL}:generateContent`;
export const MAX_TEXT = 400;
/** Same seed every time — Google's new voices drift in pitch between calls; a fixed seed keeps one voice sounding like one person. */
export const TTS_SEED = 7;
/** Dollars per second of Google voice: 25 audio tokens/s × $6 per million. */
export const USD_PER_SEC = 25 * 6 / 1_000_000;
/** Won per second of Google voice (× ₩1,450). */
export const WON_PER_SEC = USD_PER_SEC * 1450;
/** Owner 2026-10-01: the welcome credit is the member's Google-voice credit — reading aloud takes what Google charged from the
 *  balance, and an empty balance means the phone's own voice. UC_VOICE_CREDIT=off puts it back to free within the daily minutes. */
export const voiceOnCredit = () => process.env.UC_VOICE_CREDIT !== "off";
/** 16 kHz · 16-bit · mono WAV = 32,000 bytes a second (what the browser recorder sends). */
export const WAV_BYTES_PER_SEC = 32000;
export const MAX_WAV = 2 * 1024 * 1024;

const num = (v: string | undefined, d: number) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : d; };
/** Per member per day. Owner decision 2026-09-29: 60 minutes of Google voice. */
export const speakSecPerDay = () => num(process.env.UC_VOICE_MINUTES, 60) * 60;
/** Listening is only for the first words of a voice chat (to find the language), so it gets a small allowance. */
export const hearSecPerDay = () => num(process.env.UC_VOICE_HEAR_MINUTES, 10) * 60;
/** Safety net for the whole service — a sudden rush of sign-ups can't run up an open-ended bill. */
export const companyCapWon = () => num(process.env.UC_VOICE_DAILY_CAP_WON, 30000);

export const hasGoogleVoice = () => Boolean(process.env.GEMINI_API_KEY);

export function dayIn(tz: string, now = new Date()): string {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now); }
  catch { return now.toISOString().slice(0, 10); }
}

export type Allowance = { ok: boolean; why?: "daily_limit" | "company_limit" | "off"; speakLeft: number; hearLeft: number; credit: boolean };

export async function allowance(userId: string, tz: string, now = new Date()): Promise<Allowance> {
  const day = dayIn(tz, now);
  // One round trip: the database may be far from the web server, and this runs before every spoken piece.
  const r = await one<{ speak_sec: number | null; hear_sec: number | null; t: number }>(
    "select (select speak_sec from voice_usage where user_id = $1 and day = $2) as speak_sec, (select hear_sec from voice_usage where user_id = $1 and day = $2) as hear_sec, uc_voice_total($2::date) as t",
    [userId, day]);
  const speakLeft = Math.max(0, speakSecPerDay() - (r?.speak_sec ?? 0));
  const hearLeft = Math.max(0, hearSecPerDay() - (r?.hear_sec ?? 0));
  const credit = !voiceOnCredit() || (await wallet(userId).catch(() => ({ micro: 0 }))).micro > 0;
  if (!hasGoogleVoice()) return { ok: false, why: "off", speakLeft, hearLeft, credit };
  if ((r?.t ?? 0) * WON_PER_SEC >= companyCapWon()) return { ok: false, why: "company_limit", speakLeft, hearLeft, credit };
  return { ok: true, speakLeft, hearLeft, credit };
}

/** Takes a finished spoken piece from the member's credit (no-op when voice is free). */
export async function chargeVoice(userId: string, sec: number): Promise<void> {
  if (voiceOnCredit() && sec > 0) await charge(userId, sec * USD_PER_SEC, "Google voice");
}

export async function addUsage(userId: string, tz: string, add: { speak?: number; hear?: number }, now = new Date()): Promise<void> {
  const s = Math.round((add.speak ?? 0) * 10) / 10, h = Math.round((add.hear ?? 0) * 10) / 10;
  if (s <= 0 && h <= 0) return;
  await q(`insert into voice_usage(user_id, day, speak_sec, hear_sec, calls) values ($1, $2, $3, $4, 1)
           on conflict (user_id, day) do update set speak_sec = voice_usage.speak_sec + excluded.speak_sec,
             hear_sec = voice_usage.hear_sec + excluded.hear_sec, calls = voice_usage.calls + 1`, [userId, dayIn(tz, now), s, h]);
}

export function ttsBody(text: string, voice: string): string {
  return JSON.stringify({
    model: TTS_MODEL,
    input: [{ type: "user_input", content: [{ type: "text", text }] }],
    response_format: { type: "audio", mime_type: "audio/l16" },
    generation_config: { speech_config: [{ voice }], seed: TTS_SEED },
    stream: true,
  });
}

/** One SSE line from Google → the audio piece in it (24 kHz 16-bit mono PCM), or null. */
export function audioOfLine(line: string): Uint8Array | null {
  if (!line.startsWith("data:")) return null;
  try {
    const d = JSON.parse(line.slice(5)) as { event_type?: string; delta?: { mime_type?: string; data?: unknown } };
    if (d.event_type !== "step.delta" || typeof d.delta?.data !== "string" || !String(d.delta.mime_type ?? "audio").startsWith("audio")) return null;
    return new Uint8Array(Buffer.from(d.delta.data, "base64"));
  } catch { return null; }
}

/** Opens Google's audio stream. Null when Google refuses (the browser then reads with the phone's voice). */
export async function openTts(text: string, voice: string, signal: AbortSignal, fetchFn: typeof fetch = fetch): Promise<ReadableStream<Uint8Array> | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const r = await fetchFn(TTS_URL, { method: "POST", headers: { "x-goog-api-key": key, "content-type": "application/json" }, body: ttsBody(text, voice), signal }).catch(() => null);
  return r?.ok && r.body ? r.body : null;
}

/** Google's SSE → raw PCM bytes, counting them as they pass (for metering). */
export function pcmStream(sse: ReadableStream<Uint8Array>, done: (bytes: number) => Promise<void> | void): ReadableStream<Uint8Array> {
  const reader = sse.getReader(); const dec = new TextDecoder();
  let buf = ""; let bytes = 0; let closed = false;
  const finish = async () => { if (!closed) { closed = true; await Promise.resolve(done(bytes)).catch(() => {}); } };
  return new ReadableStream<Uint8Array>({
    async pull(c) {
      try {
        for (;;) {
          const { value, done: end } = await reader.read();
          if (end) { await finish(); c.close(); return; }
          buf += dec.decode(value, { stream: true });
          let i: number; let sent = false;
          while ((i = buf.indexOf("\n")) >= 0) {
            const pcm = audioOfLine(buf.slice(0, i).trim()); buf = buf.slice(i + 1);
            if (pcm?.length) { bytes += pcm.length; c.enqueue(pcm); sent = true; }
          }
          if (sent) return;
        }
      } catch { await finish(); try { c.close(); } catch { /* already closed */ } }
    },
    async cancel() { void reader.cancel().catch(() => {}); await finish(); },
  });
}

export type Heard = { lang: string; text: string };
const LANG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,4})?$/;

/** Parses Google's answer to the listening prompt. */
export function parseHeard(raw: string): Heard | null {
  // Two lines — the language code, then the words. Asked this way since 2026-10-01: in JSON mode Google escaped Korean
  // as broken «\\uc94» sequences more than half the time, and the whole answer failed to parse.
  const lines = raw.replace(/^```\w*\n?|```\s*$/g, "").trim().split("\n");
  const first = (lines[0] ?? "").trim();
  if (!first.startsWith("{") && LANG.test(first)) {
    const text = lines.slice(1).join(" ").trim().slice(0, 4000);
    return { lang: first, text };
  }
  try {
    const m = raw.match(/\{[\s\S]*\}/)?.[0] ?? raw;
    const j = JSON.parse(m) as { lang?: unknown; text?: unknown };
    const text = typeof j.text === "string" ? j.text.trim().slice(0, 4000) : "";
    const lang = typeof j.lang === "string" && LANG.test(j.lang.trim()) ? j.lang.trim() : "";
    return lang || text ? { lang, text } : null;
  } catch { return null; }
}

/** Short recording (WAV) → what was said and in which language. */
export async function hear(wav: Uint8Array, signal: AbortSignal, fetchFn: typeof fetch = fetch): Promise<Heard | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const body = {
    contents: [{ role: "user", parts: [
      { text: "Transcribe exactly what the speaker says, in the language they speak (do not translate). Reply in exactly two lines and nothing else: line 1 = that language as a BCP-47 code with region when clear (ko-KR, ja-JP, en-US, es-MX, pt-BR, hi-IN…); line 2 = the words. If there is no speech, reply with two empty lines." },
      { inline_data: { mime_type: "audio/wav", data: Buffer.from(wav).toString("base64") } },
    ] }],
    generationConfig: { temperature: 0, maxOutputTokens: 1200, thinkingConfig: { thinkingLevel: "minimal" } },
  };
  const r = await fetchFn(HEAR_URL, { method: "POST", headers: { "x-goog-api-key": key, "content-type": "application/json" }, body: JSON.stringify(body), signal }).catch(() => null);
  if (!r?.ok) return null;
  const j = (await r.json().catch(() => null)) as { candidates?: { content?: { parts?: { text?: string }[] } }[] } | null;
  const out = j?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  return parseHeard(out);
}

/** Seconds of audio in a 16 kHz mono 16-bit WAV (header 44 bytes). */
export const wavSeconds = (bytes: number) => Math.max(0, bytes - 44) / WAV_BYTES_PER_SEC;
