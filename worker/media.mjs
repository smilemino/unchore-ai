// Sound and YouTube into text (2026-10-02 owner: «don't say it can't — make it work»: the first «I can't» answers caught were
// «transcribe this recording» and «read this YouTube video»). Speech: faster-whisper on this machine (nothing leaves it — same
// engine as AI Soul's /workspace/tools/transcribe). YouTube: the video's own captions via yt-dlp; no captions → its sound, transcribed.
import { spawn } from "node:child_process";
import { appendFile, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const MAX_SPEECH_SEC = 20 * 60;   // first 20 minutes — a longer recording is cut there (and the answer says so)
const MODEL = process.env.WHISPER_MODEL ?? "small";
const STT = join(dirname(fileURLToPath(import.meta.url)), "stt.py");

function run(cmd, args, ms) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    const t = setTimeout(() => { p.kill("SIGKILL"); reject(new Error("took too long")); }, ms);
    p.stdout.on("data", (d) => { out += d; });
    p.stderr.on("data", (d) => { err = (err + d).slice(-2000); });
    p.on("error", (e) => { clearTimeout(t); reject(e); });
    p.on("close", (code) => { clearTimeout(t); code === 0 ? resolve(out) : reject(new Error(err.trim().split("\n").pop() || `exit ${code}`)); });
  });
}

/** Lines of a .vtt caption file as plain text — the timing lines, tags and the rolling repeats of auto captions go. */
export function vttText(vtt) {
  const out = [];
  for (const raw of String(vtt).split(/\r?\n/)) {
    const l = raw.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();
    if (!l || l === "WEBVTT" || /^(Kind|Language|NOTE|STYLE)\b/.test(l) || /-->/.test(l) || /^\d+$/.test(l)) continue;
    if (out[out.length - 1] !== l) out.push(l);
  }
  return out.join("\n");
}

const isYouTube = (u) => { try { const h = new URL(u).hostname.replace(/^www\.|^m\./, ""); return h === "youtube.com" || h === "youtu.be" || h === "music.youtube.com"; } catch { return false; } };

/** Speech in a sound or video file → text. `lang` empty = detected. `data` is the file, or a function that writes it to the path
 *  given (a file over 50 MB comes piece by piece — piecesTo). */
export async function speechToText(data, lang, ms) {
  const dir = await mkdtemp(join(tmpdir(), "uc-stt-"));
  try {
    const src = join(dir, "in"), wav = join(dir, "a.wav");
    if (typeof data === "function") await data(src); else await writeFile(src, data);
    const len = Number((await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", src], 30_000).catch(() => "0")).trim()) || 0;
    await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", src, "-t", String(MAX_SPEECH_SEC), "-vn", "-ac", "1", "-ar", "16000", wav], 120_000);
    const out = await run("python3", [STT, wav, MODEL, lang ?? ""], ms);
    const j = JSON.parse(out.trim().split("\n").pop());
    return { text: j.text, lang: j.lang, seconds: Math.round(len), cut: len > MAX_SPEECH_SEC };
  } finally { await rm(dir, { recursive: true, force: true }); }
}

/** A file over 50 MB on Unchore (lib/big-files.ts): its n pieces, fetched in order and appended to `path` — one piece in memory at a
 *  time. `get(i)` answers a piece's bytes or null; a missing piece stops it (never transcribes half a file as if it were whole). */
export function piecesTo(get, n) {
  return async (path) => {
    await writeFile(path, Buffer.alloc(0));
    for (let i = 0; i < n; i++) {
      const b = await get(i);
      if (!b) throw new Error(`piece ${i + 1} of ${n} couldn't be read`);
      await appendFile(path, b);
    }
  };
}

/** A YouTube video's words: its captions (made by the uploader first, then automatic), or its sound transcribed. */
export async function youtubeText(url, ms) {
  if (!isYouTube(url)) throw new Error("not a YouTube link");
  const dir = await mkdtemp(join(tmpdir(), "uc-yt-"));
  const end = Date.now() + ms;
  try {
    const info = JSON.parse(await run("yt-dlp", ["--no-warnings", "--no-playlist", "--skip-download", "--dump-json", url], 60_000));
    const pick = (subs) => { const ks = Object.keys(subs ?? {}); const orig = ks.find((k) => k.endsWith("-orig")); return [info.language, orig, "ko", "en", ks[0]].find((k) => k && ks.includes(k)); };
    const own = pick(info.subtitles), auto = own ? null : pick(info.automatic_captions);
    if (own || auto) {
      await run("yt-dlp", ["--no-warnings", "--no-playlist", "--skip-download", own ? "--write-subs" : "--write-auto-subs", "--sub-langs", own ?? auto, "--sub-format", "vtt", "-o", join(dir, "c"), url], 60_000);
      const f = (await readdir(dir)).find((x) => x.endsWith(".vtt"));
      if (f) return { title: info.title, seconds: info.duration ?? 0, source: own ? "captions" : "automatic captions", lang: own ?? auto, text: vttText(await readFile(join(dir, f), "utf8")) };
    }
    if ((info.duration ?? 0) > 3 * 3600) throw new Error("no captions, and too long to transcribe");
    await run("yt-dlp", ["--no-warnings", "--no-playlist", "-f", "bestaudio[filesize<200M]/bestaudio", "--download-sections", `*0-${MAX_SPEECH_SEC}`, "-o", join(dir, "a.%(ext)s"), url], 180_000);
    const a = (await readdir(dir)).find((x) => x.startsWith("a."));
    if (!a) throw new Error("the sound couldn't be downloaded");
    const s = await speechToText(await readFile(join(dir, a)), "", Math.max(30_000, end - Date.now()));
    return { title: info.title, seconds: info.duration ?? 0, source: "transcribed from its sound", lang: s.lang, text: s.text, cut: (info.duration ?? 0) > MAX_SPEECH_SEC };
  } finally { await rm(dir, { recursive: true, force: true }); }
}
