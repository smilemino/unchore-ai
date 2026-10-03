import { z } from "zod";

// The pure half of lib/higgsfield.ts (the chat screen reads the cards with it, so no server imports here): what an image/video
// card in an answer looks like (<<<hf {json}>>>), the price sentence Higgsfield gives, and what the AI is told.
/** A Higgsfield/fal call that didn't go through; the message is the reason the card shows (bad_key, no_balance, …). */
export class HfError extends Error {}
export const KEY_NAME = "HIGGSFIELD_KEY";
/** fal (fal.ai) — the same Seedance 2.5, but with Draft Mode: a 480p draft whose exact shot can be made again in 1080p (lib/fal-video.ts). */
export const FAL_KEY_NAME = "FAL_KEY";
/** The «same shot in 1080p» row of card i (hf_jobs.idx). Cards are 0–20. */
export const FINAL_IDX = 100;
/** The «sharper, same video» row of card i: ByteDance's upscaler on fal makes a finished 480p/720p video 1080p without redrawing it. */
export const UP_IDX = 200;
/** fal's price for that upscaler (2026-10-02): $0.0072 per second at 1080p, standard tier, up to 30 fps. 10 s ≈ $0.07. */
export const upscaleUsd = (seconds: number) => Math.round(seconds * 0.0072 * 10_000) / 10_000;
export const MODELS = { video: "bytedance/seedance-2.5/text-to-video", image: "xai/grok-imagine-image-2.0" } as const;
/** One card never spends more than this (a typo of «15» for «5» seconds at 1080p is still under it; a runaway one isn't). */
export const MAX_USD = 25;

export const HfAsk = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("video"), prompt: z.string().min(3).max(2000), res: z.enum(["480p", "720p", "1080p"]).default("480p"),
    seconds: z.number().int().min(3).max(15).default(5), aspect: z.enum(["16:9", "9:16"]).default("16:9") }),
  z.object({ kind: z.literal("image"), prompt: z.string().min(3).max(2000), aspect: z.enum(["16:9", "9:16", "1:1", "4:3", "3:4"]).default("1:1") }),
]);
export type HfAskT = z.infer<typeof HfAsk>;

const MARK = /<<<hf (\{[^\n]*\})>>>/g;
export function readHfAsks(text: string): HfAskT[] {
  const out: HfAskT[] = [];
  for (const m of text.matchAll(MARK)) { try { const r = HfAsk.safeParse(JSON.parse(m[1]!)); if (r.success) out.push(r.data); } catch { /* not JSON */ } }
  return out;
}

export function hfBody(a: HfAskT): Record<string, unknown> {
  return a.kind === "video" ? { prompt: a.prompt, resolution: a.res, duration: a.seconds, aspect_ratio: a.aspect } : { prompt: a.prompt, aspect_ratio: a.aspect };
}

/** Seedance gives no number, only a sentence: «… roughly $0.2056 per second of generated video at 480p, $0.4622 at 720p, and $1.1372
 *  at 1080p.» (16:9; 9:16 has the same pixels). Read the per-second rates from that sentence only — the next one has token rates. */
export function perSecondFrom(desc: string): Record<string, number> {
  const s = desc.split(/(?<=\.)\s+/).find((x) => /per second of generated video/i.test(x)) ?? "";
  const out: Record<string, number> = {};
  for (const m of s.matchAll(/\$(\d+(?:\.\d+)?)[^$]*?\bat (\d{3,4}p)\b/g)) out[m[2]!] = Number(m[1]);
  return out;
}

/** Seedance 2.5's price on fal (same formula Higgsfield and fal publish, 2026-10-02): video tokens = ceil(w × h × seconds × 24 / 1024),
 *  $0.0214 per 1,000 at 480p/720p and $0.0234 at 1080p. A 1080p «same shot» from a draft is the full 1080p price, not the difference. */
const DIMS = { "480p": 854 * 480, "720p": 1280 * 720, "1080p": 1920 * 1080 } as const;
export function falVideoUsd(res: "480p" | "720p" | "1080p", seconds: number): number {
  const tokens = Math.ceil((DIMS[res] * seconds * 24) / 1024);
  return Math.round((tokens / 1000) * (res === "1080p" ? 0.0234 : 0.0214) * 10_000) / 10_000;
}

/** For the AI: their Higgsfield account is connected. The order is the one that worked for us (AI Soul 2026-10-02, a 10-second
 *  dragon-and-swordsman scene: 480p tests ≈ $2.50 each, 1080p ≈ $11–14) — test cheap, pay for quality only once they like it. */
export const HF_GUIDE = [
  "## Their Higgsfield account is connected (HIGGSFIELD_KEY saved) — you can make images and videos",
  "Each image/video is ONE line at the very end of your answer; the app shows a card with the price on THEIR Higgsfield balance and makes it only when they press «Yes»:",
  '<<<hf {"kind":"video","prompt":"(English: shot, camera move, action, style)","res":"480p","seconds":5,"aspect":"16:9"}>>>',
  '<<<hf {"kind":"image","prompt":"(English)","aspect":"1:1"}>>>',
  "video: res 480p|720p|1080p, seconds 3–15, aspect 16:9|9:16. image: aspect 16:9|9:16|1:1|4:3|3:4. Never say it's made — the card does it.",
  "Tell them this order is the cheapest way to a good result (say it in a line or two): 1) one card per shot — a longer film is several short shots, " +
    "2) first a 480p test (5 s ≈ $1), 3) only the shot they like again at 1080p (about 5× the price). For a character that must look the same in every shot, make an image of it first.",
  "Write the prompt in English even if they speak another language; tell them in their language what the shot will show.",
].join("\n");

/** For the AI: their fal account is connected — video cards become 480p drafts with a «same shot in 1080p» button (owner 2026-10-02). */
export const FAL_GUIDE = [
  "## Their fal account is connected (FAL_KEY saved) — video cards run as 480p DRAFTS (Seedance 2.5 Draft Mode, like Artlist)",
  "Every video card is made on their fal account as a cheap 480p draft. When a draft is done, the card itself has a «same shot in 1080p» button: it makes THAT exact shot again in 1080p (same seed, prompt and length) within 7 days.",
  "So for a shot they liked, never write a new 1080p card (a new card is a new random take) — tell them to press the button on the draft they liked. " +
    "Say plainly that the 1080p is the full 1080p price (about 5× the draft), not the difference — what they save is not having to re-roll 1080p takes.",
  "Every finished 480p/720p video card also has «sharper, same video» (an upscaler makes it 1080p without redrawing it, about $0.07 for 10 s). It costs far less but is less sharp than a real 1080p — offer both and let them pick.",
  "A video card is ONE line at the very end of your answer; the app shows the price on THEIR fal balance and makes it only when they press «Yes»:",
  '<<<hf {"kind":"video","prompt":"(English: shot, camera move, action, style)","res":"480p","seconds":5,"aspect":"16:9"}>>>',
  "seconds 4–15, aspect 16:9|9:16; write the prompt in English and tell them in their language what the shot shows. One card per shot. " +
    "Image cards still need a Higgsfield key (<<<secret name=HIGGSFIELD_KEY>>>).",
].join("\n");

/** For the AI when it isn't connected yet: how to connect, step by step (owner 2026-10-02: «tell them how to connect Higgsfield»). */
export const HF_SETUP_GUIDE = [
  "## Making images or videos (AI video like Seedance / Kling)",
  "If they ask for a video or an AI image: Unchore makes them on THEIR OWN Higgsfield account (the bill goes to their Higgsfield balance, Unchore adds nothing). Explain briefly and give these steps:",
  "1) sign up at console.higgsfield.ai, 2) Billing → add funds (start small, e.g. $10 — a 5-second 480p test is about $1; funds expire after a year), " +
    "3) API keys → create a key (it's shown only once; copy all of it, the «id:secret» with the colon), 4) paste it into the box under your answer.",
  "End that answer with the line <<<secret name=HIGGSFIELD_KEY>>> so the box appears. Never ask them to paste the key in the chat. Once it's saved, they just ask again.",
  "Option for videos: a fal account (fal.ai → Billing → add funds; Dashboard → Keys → create a key) gives «480p draft, then the SAME shot in 1080p» and a cheap «sharper, same video» — " +
    "mention it in one line; if they want it, end with <<<secret name=FAL_KEY>>> instead (or as well).",
].join("\n");
