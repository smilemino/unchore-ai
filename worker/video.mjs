// Videos for members (2026-10-02 owner: «video work said "no outside connection" — make it work»). Two kinds:
//  make — scenes (text, an attached picture, optional narration) → each scene drawn by the browser, then ffmpeg joins them;
//  edit — the member's attached videos: trim, vertical/square/wide, speed, mute, burned-in captions, join, GIF or MP3 out.
// Nothing here runs member code: the spec is plain data, text is put into the page as text, never as HTML.
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const SIZES = { "9:16": [720, 1280], "16:9": [1280, 720], "1:1": [960, 960], "4:5": [864, 1080] };
const FPS = 25;
const MAX_SCENES = 30, MAX_SCENE_SEC = 20, MAX_OUT_SEC = 300;
const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const color = (c, d) => (/^#[0-9a-f]{3,8}$/i.test(String(c ?? "")) ? c : d);
// Text must stay readable whatever colors the AI picks (10/2 first live video: white on beige): below 3:1 contrast → dark or white, whichever reads better.
const lum = (c) => { let x = c.slice(1, c.length === 4 || c.length === 5 ? 4 : 7); if (x.length === 3) x = [...x].map((d) => d + d).join("");
  return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0); };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
export const readable = (bg, fg) => (contrast(bg, fg) >= 3 ? fg : contrast(bg, "#ffffff") >= contrast(bg, "#111827") ? "#ffffff" : "#111827");

function run(cmd, args, deadline) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (b) => { out += b; if (out.length > 1e6) out = out.slice(-1e6); });
    p.stderr.on("data", (b) => { err += b; if (err.length > 20000) err = err.slice(-20000); });
    const t = setTimeout(() => p.kill("SIGKILL"), Math.max(1000, deadline - Date.now()));
    p.on("error", (e) => { clearTimeout(t); reject(e); });
    p.on("close", (code) => { clearTimeout(t); code === 0 ? resolve(out) : reject(new Error(Date.now() >= deadline ? "took too long" : `${cmd} failed: ${err.split("\n").filter(Boolean).slice(-3).join(" | ").slice(0, 300)}`)); });
  });
}
const ff = (args, deadline) => run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], deadline);

async function probe(file, deadline) {
  const out = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", file], deadline);
  const j = JSON.parse(out);
  const types = (j.streams ?? []).map((s) => s.codec_type);
  return { duration: Number(j.format?.duration) || 0, video: types.includes("video"), audio: types.includes("audio") };
}

/** One scene as a page: big text that shrinks to fit, an optional picture (cover behind the text, or whole above it). */
export function sceneHtml(s, [w, h], img) {
  const bg = color(s.bg, "#111827"), fg = img && s.fit !== "contain" ? color(s.color, "#ffffff") : readable(bg, color(s.color, "#ffffff"));
  const text = esc(s.text), sub = esc(s.sub);
  const cover = img && s.fit !== "contain";
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:${bg};color:${fg};font-family:"Noto Sans CJK KR","Noto Sans CJK JP","Noto Sans",system-ui,sans-serif}
.bg{position:absolute;inset:0;background:url("${img ?? ""}") center/cover no-repeat}
.shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.15),rgba(0,0,0,.6))}
.wrap{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:${cover ? "flex-end" : "center"};align-items:center;gap:${Math.round(h * 0.02)}px;padding:${Math.round(w * 0.08)}px;box-sizing:border-box;text-align:center}
.pic{max-width:100%;max-height:${text || sub ? "58%" : "100%"};object-fit:contain;border-radius:${Math.round(w * 0.02)}px}
.t{font-weight:800;line-height:1.25;word-break:keep-all;overflow-wrap:anywhere;text-shadow:0 2px 12px rgba(0,0,0,.35)}
.s{opacity:.85;line-height:1.4;word-break:keep-all;overflow-wrap:anywhere}
</style></head><body>${cover ? `<div class="bg"></div><div class="shade"></div>` : ""}<div class="wrap">${img && !cover ? `<img class="pic" src="${img}">` : ""}${text ? `<div class="t" id="t">${text}</div>` : ""}${sub ? `<div class="s" id="s">${sub}</div>` : ""}</div>
<script>
const W=${w},H=${h};const fit=(id,start,min,share)=>{const e=document.getElementById(id);if(!e)return;let f=start;e.style.fontSize=f+"px";while(f>min&&(e.scrollHeight>H*share||e.scrollWidth>W*0.86)){f-=2;e.style.fontSize=f+"px"}};
fit("t",Math.round(Math.min(W,H)*0.11),18,${img && !cover ? 0.22 : 0.5});fit("s",Math.round(Math.min(W,H)*0.05),14,0.2);
</script></body></html>`;
}

/** One caption as a transparent page the size of the video, text near the bottom. */
export function captionHtml(text, [w, h]) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:${w}px;height:${h}px;background:transparent;font-family:"Noto Sans CJK KR","Noto Sans CJK JP","Noto Sans",system-ui,sans-serif}
.c{position:absolute;left:6%;right:6%;bottom:9%;text-align:center}.c span{display:inline;background:rgba(0,0,0,.62);color:#fff;font-weight:700;font-size:${Math.round(Math.min(w, h) * 0.055)}px;line-height:1.5;padding:.12em .4em;border-radius:.3em;box-decoration-break:clone;-webkit-box-decoration-break:clone;word-break:keep-all;overflow-wrap:anywhere}</style></head>
<body><div class="c"><span>${esc(text)}</span></div></body></html>`;
}

async function shoot(browser, html, size, file, transparent = false) {
  const ctx = await browser.newContext({ viewport: { width: size[0], height: size[1] }, deviceScaleFactor: 1 });
  try {
    const page = await ctx.newPage();
    await page.setContent(html, { waitUntil: "load", timeout: 20000 });
    await page.screenshot({ path: file, omitBackground: transparent, timeout: 20000 });
  } finally { await ctx.close().catch(() => {}); }
}

const dataUrl = (a) => `data:${a.mime};base64,${a.b64}`;
const fill = ([w, h]) => `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1`;
const fitIn = ([w, h]) => `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`;
const ENC = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-r", String(FPS), "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2"];

/** Speed as ffmpeg's atempo chain (each step 0.5–2). */
function atempo(speed) {
  const parts = []; let s = speed;
  while (s > 2) { parts.push("atempo=2"); s /= 2; }
  while (s < 0.5) { parts.push("atempo=0.5"); s /= 0.5; }
  parts.push(`atempo=${s.toFixed(4)}`);
  return parts.join(",");
}

async function make(browser, spec, assets, audio, dir, deadline) {
  const size = SIZES[spec.size] ?? SIZES["9:16"];
  const scenes = (Array.isArray(spec.scenes) ? spec.scenes : []).slice(0, MAX_SCENES);
  if (!scenes.length) throw new Error("no scenes");
  const parts = []; let total = 0;
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i] ?? {};
    const a = s.image ? assets[s.image] : null;
    const img = a && /^image\//.test(a.mime) ? dataUrl(a) : null;
    const png = path.join(dir, `s${i}.png`);
    await shoot(browser, sceneHtml(s, size, img), size, png);
    const pcm = audio?.[i] ? Buffer.from(audio[i], "base64") : null;
    const voiced = pcm && pcm.length > 4800;
    const dur = Math.min(MAX_SCENE_SEC, Math.max(num(s.seconds, 3, 1, MAX_SCENE_SEC), voiced ? pcm.length / 48000 + 0.6 : 0));
    if (total + dur > MAX_OUT_SEC) break;
    total += dur;
    const frames = Math.round(dur * FPS);
    const zoom = spec.motion === false ? "" : `scale=${size[0] * 2}:-2,zoompan=z='min(1+0.0007*on,1.1)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${size[0]}x${size[1]}:fps=${FPS},`;
    const vf = `${zoom}fade=t=in:st=0:d=0.3,fade=t=out:st=${Math.max(0, dur - 0.3).toFixed(2)}:d=0.3,format=yuv420p`;
    const aIn = voiced ? (await fs.writeFile(path.join(dir, `a${i}.pcm`), pcm), ["-f", "s16le", "-ar", "24000", "-ac", "1", "-i", path.join(dir, `a${i}.pcm`)]) : ["-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono"];
    const out = path.join(dir, `p${i}.mp4`);
    await ff(["-framerate", String(FPS), "-loop", "1", "-i", png, ...aIn, "-vf", vf, "-af", "apad", "-frames:v", String(frames), "-t", dur.toFixed(2), ...ENC, out], deadline);
    parts.push(out);
  }
  return parts;
}

async function edit(browser, spec, assets, dir, deadline) {
  const names = (Array.isArray(spec.from) ? spec.from : [spec.from]).filter(Boolean).map(String).slice(0, 10);
  if (!names.length) throw new Error("no source video");
  const parts = [];
  let size = SIZES[spec.size] ?? null;
  const speed = num(spec.speed, 1, 0.25, 4);
  for (let i = 0; i < names.length; i++) {
    const a = assets[names[i]];
    if (!a) throw new Error(`attached file not found: ${names[i]}`);
    const src = path.join(dir, `in${i}${path.extname(names[i]).slice(0, 6) || ".bin"}`);
    await fs.writeFile(src, Buffer.from(a.b64, "base64"));
    const info = await probe(src, deadline);
    if (!info.video && !info.audio) throw new Error(`${names[i]} is not a video or audio file`);
    if (!size && info.video) {   // keep the first clip's shape when none was asked for
      const wh = (await run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", src], deadline)).trim().split("x").map(Number);
      const [w0, h0] = wh[0] && wh[1] ? wh : [1280, 720];
      const k = Math.min(1, 1280 / Math.max(w0, h0));
      size = [Math.round((w0 * k) / 2) * 2, Math.round((h0 * k) / 2) * 2];
    }
    const trim = Array.isArray(spec.trim) && i === 0 && names.length === 1 ? spec.trim : null;
    const ss = trim ? num(trim[0], 0, 0, 36000) : 0;
    const to = trim && trim[1] != null ? num(trim[1], info.duration, ss + 0.1, 36000) : null;
    const v = info.video ? `${spec.fit === "contain" ? fitIn(size) : fill(size)},setpts=PTS/${speed}` : null;
    const aF = spec.mute || !info.audio ? null : `${speed !== 1 ? atempo(speed) + "," : ""}aresample=44100`;
    const out = path.join(dir, `e${i}.mp4`);
    const args = [...(ss ? ["-ss", String(ss)] : []), ...(to ? ["-to", String(to)] : []), "-i", src];
    if (!info.video) args.push("-f", "lavfi", "-i", `color=c=black:s=${(size ?? SIZES["16:9"]).join("x")}:r=${FPS}`);
    if (!aF) args.push("-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo");
    const vIdx = info.video ? "0:v" : "1:v", aIdx = aF ? "0:a" : `${info.video ? 1 : 2}:a`;
    args.push("-filter_complex", `[${vIdx}]${v ?? "setsar=1"},fps=${FPS},format=yuv420p[v];[${aIdx}]${aF ?? "anull"}[a]`, "-map", "[v]", "-map", "[a]", "-shortest", ...ENC, out);
    await ff(args, deadline);
    parts.push(out);
  }
  return { parts, size: size ?? SIZES["16:9"] };
}

/** Burned-in captions: each one drawn by the browser as a see-through picture and laid over its time span. */
async function burnCaptions(browser, file, caps, size, dir, deadline) {
  const list = (Array.isArray(caps) ? caps : []).filter((c) => c && String(c.text ?? "").trim()).slice(0, 80);
  if (!list.length) return file;
  const ins = [], chain = [];
  let last = "0:v";
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    const png = path.join(dir, `c${i}.png`);
    await shoot(browser, captionHtml(String(c.text).slice(0, 200), size), size, png, true);
    ins.push("-i", png);
    const a = num(c.from, 0, 0, 36000), b = num(c.to, a + 3, a + 0.1, 36000);
    const tag = `o${i}`;
    chain.push(`[${last}][${i + 1}:v]overlay=0:0:enable='between(t,${a},${b})'[${tag}]`);
    last = tag;
  }
  const out = path.join(dir, "captioned.mp4");
  await ff(["-i", file, ...ins, "-filter_complex", chain.join(";"), "-map", `[${last}]`, "-map", "0:a?", ...ENC, out], deadline);
  return out;
}

/** POST /video {spec, assets: {name: {mime, b64}}, audio?: (b64 PCM | null)[]} → the file's bytes. */
export async function makeVideo(browser, j, ms = 240_000) {
  const deadline = Date.now() + ms;
  const spec = j.spec ?? {};
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ucv-"));
  try {
    const kind = spec.from ? "edit" : "make";
    let parts, size;
    if (kind === "make") { size = SIZES[spec.size] ?? SIZES["9:16"]; parts = await make(browser, spec, j.assets ?? {}, j.audio, dir, deadline); }
    else ({ parts, size } = await edit(browser, spec, j.assets ?? {}, dir, deadline));
    const list = path.join(dir, "list.txt");
    await fs.writeFile(list, parts.map((p) => `file '${p}'`).join("\n"));
    let joined = path.join(dir, "joined.mp4");
    await ff(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", joined], deadline);
    joined = await burnCaptions(browser, joined, spec.captions, size, dir, deadline);
    const format = ["gif", "mp3"].includes(spec.format) ? spec.format : "mp4";
    const out = path.join(dir, `out.${format}`);
    if (format === "mp4") await ff(["-i", joined, "-c", "copy", "-movflags", "+faststart", out], deadline);
    else if (format === "mp3") await ff(["-i", joined, "-vn", "-c:a", "libmp3lame", "-b:a", "160k", out], deadline);
    else await ff(["-i", joined, "-vf", `fps=12,scale=${Math.min(480, size[0])}:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer`, "-loop", "0", out], deadline);
    const data = await fs.readFile(out);
    const info = await probe(format === "gif" ? joined : out, deadline).catch(() => ({ duration: 0 }));
    return { ok: true, format, seconds: Math.round(info.duration * 10) / 10, data };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
