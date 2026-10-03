// Videos in chat (2026-10-02 owner: a member was told «video work can't be done — no outside connection»; «make what can't be
// done work right away»). The answer carries a ```unchore-video``` block (plain data); the worker (worker/video.mjs) draws the
// scenes in its browser and joins or edits them with ffmpeg; the result comes back as a chat file (MP4, GIF or MP3).
import { asMember, q } from "./db";
import { unlockBytes } from "./privacy";
import { tr } from "./i18n-server";
import type { Lang } from "./i18n";
import { allowance, addUsage, chargeVoice, MAX_TEXT, openTts, pcmStream } from "./voice/google";

export type VideoSpec = {
  name: string; format: "mp4" | "gif" | "mp3"; size?: string; fit?: "contain";
  scenes?: { text?: string; sub?: string; image?: string; seconds?: number; bg?: string; color?: string; fit?: "contain"; say?: string }[];
  voice?: boolean; motion?: boolean;
  from?: string[]; trim?: [number, number?]; speed?: number; mute?: boolean;
  captions?: { from: number; to: number; text: string }[];
};

const FENCE = /```unchore-video\s*\n([\s\S]*?)\n```/g;
// A video asked for inside a file block (```unchore-file {"format":"mp4"…}) is taken as a video too.
const FILE_FENCE = /```(?:unchore-file|soul-file)\s*\n(\{[\s\S]*?"format"\s*:\s*"(?:mp4|gif|mp3|video)"[\s\S]*?\})\n```/g;
const SIZES = new Set(["9:16", "16:9", "1:1", "4:5"]);

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined);
const s = (v: unknown, max = 400) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);

export function toVideoSpec(raw: unknown): VideoSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const format = o.format === "gif" ? "gif" : o.format === "mp3" ? "mp3" : "mp4";
  const base = (s(o.name, 120) ?? `unchore.${format}`).replace(/[\\/:*?"<>|]/g, "_");
  const name = /\.(mp4|gif|mp3)$/i.test(base) ? base.replace(/\.(mp4|gif|mp3)$/i, `.${format}`) : `${base}.${format}`;
  const size = typeof o.size === "string" && SIZES.has(o.size) ? o.size : undefined;
  const from = (Array.isArray(o.from) ? o.from : o.from ? [o.from] : []).map((x) => s(x, 200)).filter((x): x is string => !!x).slice(0, 10);
  const captions = (Array.isArray(o.captions) ? o.captions : []).flatMap((c) => {
    const r = (c ?? {}) as Record<string, unknown>; const text = s(r.text, 200); const a = n(r.from) ?? 0, b = n(r.to);
    return text ? [{ from: Math.max(0, a), to: b !== undefined && b > a ? b : a + 3, text }] : [];
  }).slice(0, 80);
  const common = { name, format, ...(size ? { size } : {}), ...(o.fit === "contain" ? { fit: "contain" as const } : {}), ...(captions.length ? { captions } : {}) } satisfies Partial<VideoSpec>;
  if (from.length) {
    const t = Array.isArray(o.trim) ? o.trim.map(n) : [];
    const trim: [number, number?] | undefined = t[0] !== undefined || t[1] !== undefined ? [Math.max(0, t[0] ?? 0), t[1]] : undefined;
    const speed = n(o.speed);
    return { ...common, from, ...(trim ? { trim } : {}), ...(speed && speed !== 1 ? { speed: Math.min(4, Math.max(0.25, speed)) } : {}), ...(o.mute === true ? { mute: true } : {}) };
  }
  const scenes = (Array.isArray(o.scenes) ? o.scenes : []).flatMap((x) => {
    const r = (typeof x === "string" ? { text: x } : x ?? {}) as Record<string, unknown>;
    const sc = { text: s(r.text, 300), sub: s(r.sub, 300), image: s(r.image, 200), seconds: n(r.seconds), bg: s(r.bg, 9), color: s(r.color, 9), say: s(r.say, MAX_TEXT), ...(r.fit === "contain" ? { fit: "contain" as const } : {}) };
    return sc.text || sc.sub || sc.image ? [Object.fromEntries(Object.entries(sc).filter(([, v]) => v !== undefined)) as NonNullable<VideoSpec["scenes"]>[number]] : [];
  }).slice(0, 30);
  if (!scenes.length) return null;
  return { ...common, scenes, ...(o.voice === true ? { voice: true } : {}), ...(o.motion === false ? { motion: false } : {}) };
}

/** Takes the video blocks out of an answer; each is replaced by «🎬 name» (the file chip appears under the answer). */
export function readVideoBlocks(text: string): { text: string; specs: VideoSpec[]; bad: number } {
  const specs: VideoSpec[] = []; let bad = 0;
  const take = (_m: string, body: string) => {
    let spec: VideoSpec | null = null;
    try { spec = toVideoSpec(JSON.parse(body)); } catch { /* counted below */ }
    if (!spec || specs.length >= 3) { bad++; return ""; }
    specs.push(spec);
    return `🎬 ${spec.name}`;
  };
  // An empty fence makes nothing; drop it so the answer doesn't show a blank box (seen 2026-10-02 next to a fal video card).
  const out = text.replace(/```unchore-video[ \t]*\n?```/g, "").replace(FENCE, take).replace(FILE_FENCE, take);
  return { text: out, specs, bad };
}

export const VIDEO_GUIDE = [
  "## Videos (Unchore makes and edits them — never say video work can't be done here)",
  "When the user wants a video, a short (Reels/Shorts/TikTok), a slideshow, a GIF, captions on a clip, a clip cut/trimmed/joined/sped up/made vertical, or the sound taken out as MP3:",
  "put ONE fenced block in your answer (up to 3) and one or two plain lines outside it. Open the fence with ```unchore-video and put one JSON object inside. The app makes the file and shows it under the answer.",
  'Make a new video from scenes: {"name":"Intro.mp4","size":"9:16","voice":true,"scenes":[{"text":"Big line","sub":"small line","image":"photo.jpg","seconds":3,"say":"what the narrator reads"}]}',
  "  size: 9:16 (phone, default) · 16:9 · 1:1 · 4:5. image = the exact file name of a picture the user attached (fills the screen with the text on top; add \"fit\":\"contain\" to show the whole picture). bg/color = #hex. voice:true reads each scene's «say» (or its text) aloud with a natural voice. Up to 30 scenes, 20 s each.",
  'Edit attached videos: {"name":"Cut.mp4","from":["clip.mp4"],"trim":[5,20],"size":"9:16","speed":1.5,"mute":false,"captions":[{"from":0,"to":3,"text":"Hello"}]}',
  "  from = exact names of attached video/audio files (several are joined in order); trim = start and end second (first clip only); speed 0.25–4; captions are burned in. \"format\":\"gif\" makes a GIF, \"format\":\"mp3\" keeps only the sound.",
  "If details are missing, make a sensible first version anyway (good short lines, 3–6 scenes), then ask one short question. Don't write a script for them to produce elsewhere and don't send them to another app — make it here.",
  "You can't see inside an attached video; ask what's in it only if the edit depends on it (e.g. where to cut).",
  "New AI footage from a description (people, animals, places, camera moves — Seedance/Kling) is NOT this block: that is the <<<hf …>>> card on their own Higgsfield/fal account. Never add an unchore-video block next to such a card.",
].join("\n");

type Asset = { mime: string; b64: string };

/** The member's files in this chat, newest first by name (attachments and files Unchore made earlier). */
async function assetsFor(userId: string, convId: string, names: string[]): Promise<Record<string, Asset>> {
  if (!names.length) return {};
  const rows = await q<{ name: string; mime: string; data: Buffer }>(
    "select distinct on (name) name, mime, data from files where user_id = $1 and conversation_id = $2 and name = any($3::text[]) and parts_of is null order by name, created_at desc", [userId, convId, names]);
  // A name the AI got slightly wrong (case, spacing): the only attached file of that kind stands in.
  const out: Record<string, Asset> = {};
  for (const r of rows) out[r.name] = { mime: r.mime, b64: Buffer.from(unlockBytes(r.data)).toString("base64") };
  const missing = names.filter((x) => !out[x]);
  if (missing.length) {
    const all = await q<{ name: string; mime: string; data: Buffer }>("select name, mime, data from files where user_id = $1 and conversation_id = $2 and parts_of is null and (mime like 'image/%' or mime like 'video/%' or mime like 'audio/%') order by created_at desc limit 20", [userId, convId]);
    const norm = (x: string) => x.toLowerCase().replace(/\s+/g, "");
    for (const m of missing) {
      const hit = all.find((r) => norm(r.name) === norm(m)) ?? (() => { const kind = /\.(mp4|mov|webm|m4v|mkv|avi|mp3|m4a|wav)$/i.test(m) ? /^(video|audio)\// : /^image\//; const same = all.filter((r) => kind.test(r.mime)); return same.length === 1 ? same[0] : undefined; })();
      if (hit) out[m] = { mime: hit.mime, b64: Buffer.from(unlockBytes(hit.data)).toString("base64") };
    }
  }
  return out;
}

/** Narration: Google's voice for each scene, metered and paid like reading answers aloud (app/api/voice/tts). Silent when not allowed. */
async function narrate(userId: string, tz: string, spec: VideoSpec, voice: string): Promise<{ audio: (string | null)[]; why?: string }> {
  const lines = (spec.scenes ?? []).map((x) => (x.say ?? [x.text, x.sub].filter(Boolean).join(". ")).slice(0, MAX_TEXT));
  const a = await allowance(userId, tz);
  const no = !a.ok ? a.why : a.speakLeft <= 0 ? "daily_limit" : !a.credit ? "no_credit" : null;
  if (no) return { audio: lines.map(() => null), why: no };
  const audio = await Promise.all(lines.map(async (line) => {
    if (!line.trim()) return null;
    const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), 60_000);
    try {
      const sse = await openTts(line, voice, ac.signal);
      if (!sse) return null;
      const chunks: Uint8Array[] = [];
      const reader = pcmStream(sse, async (bytes) => {
        await asMember(userId, () => addUsage(userId, tz, { speak: bytes / 48000 }));
        await chargeVoice(userId, bytes / 48000);
      }).getReader();
      for (;;) { const { value, done } = await reader.read(); if (done) break; if (value) chunks.push(value); }
      return chunks.length ? Buffer.concat(chunks).toString("base64") : null;
    } catch { return null; } finally { clearTimeout(timer); }
  }));
  return { audio };
}

export type MadeVideo = { name: string; mime: string; data: Buffer; seconds: number; voiceWhy?: string };
export type VideoFail = { why: "off" | "missing" | "busy" | "timeout" | "failed"; detail?: string };
const MIME = { mp4: "video/mp4", gif: "image/gif", mp3: "audio/mpeg" } as const;

/** Why a video wasn't made, in the member's language (the worker's own message stays as a short detail). */
export function videoWhy(lang: Lang, why: VideoFail["why"], detail?: string): string {
  if (why === "missing") return tr(lang, "the attached file {names} isn't in this chat — attach it here and ask again.", { names: detail ?? "" });
  if (why === "busy") return tr(lang, "the video maker is busy — ask again in a minute.");
  if (why === "timeout") return tr(lang, "it took too long — ask for a shorter video or fewer scenes.");
  if (why === "off") return tr(lang, "the video maker isn't connected right now.");
  return tr(lang, "the file couldn't be processed ({detail}).", { detail: (detail ?? "").slice(0, 160) });
}

/** Makes one video on the worker. Never throws. */
export async function makeVideo(o: { userId: string; convId: string; tz: string; voice: string; spec: VideoSpec; ms: number }): Promise<MadeVideo | VideoFail> {
  const url = process.env.BROWSER_WORKER_URL;
  if (!url) return { why: "off" };
  const spec = o.spec;
  const names = [...new Set([...(spec.from ?? []), ...(spec.scenes ?? []).flatMap((x) => (x.image ? [x.image] : []))])];
  const assets = await assetsFor(o.userId, o.convId, names);
  const lost = (spec.from ?? []).filter((x) => !assets[x]);
  if (lost.length) return { why: "missing", detail: lost.join(", ") };
  const nar = spec.voice && spec.scenes ? await narrate(o.userId, o.tz, spec, o.voice) : null;
  const res = await fetch(`${url.replace(/\/$/, "")}/video`, {
    method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
    body: JSON.stringify({ spec, assets, ...(nar ? { audio: nar.audio } : {}), ms: Math.max(20_000, o.ms - 8_000) }), signal: AbortSignal.timeout(o.ms),
  }).catch((e: Error) => (e.name === "TimeoutError" ? "timeout" : "failed") as "timeout" | "failed");
  if (typeof res === "string") return { why: res, ...(res === "failed" ? { detail: "no answer" } : {}) };
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { why?: string };
    return res.status === 429 ? { why: "busy" } : /took too long/.test(j.why ?? "") ? { why: "timeout" } : { why: "failed", detail: j.why ?? `HTTP ${res.status}` };
  }
  const data = Buffer.from(await res.arrayBuffer());
  const format = (res.headers.get("x-format") ?? spec.format) as keyof typeof MIME;
  return { name: spec.name, mime: MIME[format] ?? "video/mp4", data, seconds: Number(res.headers.get("x-seconds")) || 0, ...(nar?.why ? { voiceWhy: nar.why } : {}) };
}
