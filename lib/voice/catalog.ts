// Google voices for voice mode (Gemini 3.8 TTS). Taken from GET /v1beta/voices on 2026-09-29: 2,089 voices in 30 locales,
// plus 30 multilingual voices (language «*») that read any language — used when the user's language has no voices of its own.
// Nobody picks from a list: the app starts with one default voice for the user's language and changes it when they ask in words
// («a male voice», «calmer», «Busan accent») — the AI turns that into a VoiceWish (lib/voice/marker.ts) and pickVoice() finds the nearest voice.
import raw from "./voices.json";

export type Gender = "m" | "f" | "n";
export type Voice = { id: string; locale: string; accent: string; gender: Gender; pitch: 1 | 2 | 3 };
export type VoiceWish = { gender?: "m" | "f"; pitch?: 1 | 2 | 3; accent?: string; reset?: boolean; other?: boolean };

export const VOICES: Voice[] = (raw as [string, string, string, Gender, 1 | 2 | 3][]).map(([id, locale, accent, gender, pitch]) => ({ id, locale, accent, gender, pitch }));
const BY_ID = new Map(VOICES.map((v) => [v.id, v]));
export const LOCALES = [...new Set(VOICES.map((v) => v.locale).filter((l) => l !== "*"))];

/** The everyday accent of a locale (en-US: Google files its «General American» voices under the multilingual ones, so Midwest) — the one a new user hears first. Others are offered only when the user asks or clearly speaks that way. */
const MAIN_ACCENT: Record<string, string> = {
  "en-US": "Midwest", "en-GB": "Winchester English", "en-CA": "Toronto English", "es-419": "Mexico Spanish",
  "ja-JP": "Tokyo Japanese", "ko-KR": "Seoul Korean", "hi-IN": "Haryanvi Hindi", "ar-EG": "Egyptian Arabic",
};
/** Hand-checked first voices (ko: the same default as AI Soul — 44, female, Seoul, medium pitch). */
const FIRST: Record<string, string> = { "ko-KR": "ko-kr-assistant-9", "*": "kore" };

export const isVoice = (id: unknown): id is string => typeof id === "string" && BY_ID.has(id);
export const voiceOf = (id: string): Voice | undefined => BY_ID.get(id);

/** «ja», «es-MX», «pt» → the locale we have voices for; «*» when there are none (multilingual voices read it). */
export function localeFor(lang: string | null | undefined): string {
  const l = (lang ?? "").trim().replace("_", "-");
  if (!l) return "*";
  const exact = LOCALES.find((x) => x.toLowerCase() === l.toLowerCase());
  if (exact) return exact;
  const [base = "", region] = l.toLowerCase().split("-");
  if (base === "es" && region && region !== "es") return "es-419";
  if (base === "ar") return "ar-001";
  const same = LOCALES.filter((x) => x.toLowerCase().startsWith(`${base}-`));
  if (!same.length) return "*";
  const byRegion = same.find((x) => x.toLowerCase().endsWith(`-${region}`));
  const prefer: Record<string, string> = { en: "en-US", pt: "pt-BR" };
  return byRegion ?? (prefer[base] && same.includes(prefer[base]) ? prefer[base] : undefined) ?? same.find((x) => x === `${base}-${base.toUpperCase()}`) ?? same[0]!;
}

export function mainAccent(locale: string): string {
  if (MAIN_ACCENT[locale]) return MAIN_ACCENT[locale];
  const n = new Map<string, number>();
  for (const v of VOICES) if (v.locale === locale) n.set(v.accent, (n.get(v.accent) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "";
}
/** Regional accents a user may ask for in this locale (besides the main one). */
export function otherAccents(locale: string): string[] {
  const main = mainAccent(locale);
  return [...new Set(VOICES.filter((v) => v.locale === locale && v.accent && v.accent !== main).map((v) => v.accent))].sort();
}

export function defaultVoice(locale: string): string {
  const first = FIRST[locale];
  if (first && BY_ID.has(first)) return first;
  const main = mainAccent(locale);
  const pool = VOICES.filter((v) => v.locale === locale && v.accent === main);
  const f = pool.filter((v) => v.gender === "f");
  const best = (f.length ? f : pool).sort((a, b) => Math.abs(a.pitch - 2) - Math.abs(b.pitch - 2) || rank(a.id) - rank(b.id) || a.id.localeCompare(b.id, "en", { numeric: true }))[0];
  return best?.id ?? FIRST["*"]!;
}
const rank = (id: string) => (/-assistant-/.test(id) ? 0 : /-concierge-|-tutor-/.test(id) ? 1 : 2);

/** The nearest voice to what the user asked for. Things they didn't mention (gender, pitch, accent) follow the current voice.
 *  Never returns the current voice unless nothing else fits — the change has to be audible. */
export function pickVoice(wish: VoiceWish, currentId: string, locale: string): string {
  const home = localeFor(locale);
  if (wish.reset) return defaultVoice(home);
  const cur = voiceOf(currentId);
  const loc = cur && (cur.locale === home || home === "*") ? cur.locale : home;
  const base = cur && cur.locale === loc ? cur : voiceOf(defaultVoice(loc))!;
  const gender = wish.gender ?? (base.gender === "n" ? "f" : base.gender);
  const pitch = wish.pitch ?? base.pitch;
  const wanted = wish.accent === "standard" ? mainAccent(loc) : wish.accent;
  const accent = wanted && VOICES.some((v) => v.locale === loc && v.accent === wanted) ? wanted : base.accent;
  const inLoc = VOICES.filter((v) => v.locale === loc && v.id !== base.id);
  const tiers = [
    inLoc.filter((v) => v.gender === gender && v.accent === accent),
    inLoc.filter((v) => v.accent === accent),
    inLoc.filter((v) => v.gender === gender),
    inLoc,
  ];
  const pool = tiers.find((t) => t.length) ?? [];
  const score = (v: Voice) => Math.abs(v.pitch - pitch) * 10 + (v.gender === gender ? 0 : 5) + rank(v.id);
  return [...pool].sort((a, b) => score(a) - score(b) || a.id.localeCompare(b.id, "en", { numeric: true }))[0]?.id ?? base.id;
}

/** Where this device keeps the chosen Google voice (voice mode reads it; Settings › voice list writes it). */
export const VOICE_ID_KEY = "uc_voice_id";
export type VoiceFilter = { gender: "all" | "m" | "f"; pitch: "all" | 1 | 2 | 3; accent: string };
/** Settings › voice list (AI Soul VoicePicker, 2026-10-02): the voices of one locale, narrowed by gender, pitch and accent —
 *  the everyday accent first, then lower to higher, the hand-checked kinds (assistant…) before the rest. Picking by words still works. */
export function voiceChoices(locale: string, f: VoiceFilter): Voice[] {
  const main = mainAccent(locale);
  return VOICES.filter((v) => v.locale === locale && (f.gender === "all" || v.gender === f.gender) && (f.pitch === "all" || v.pitch === f.pitch) && (!f.accent || v.accent === f.accent))
    .sort((a, b) => Number(b.accent === main) - Number(a.accent === main) || a.accent.localeCompare(b.accent) || a.pitch - b.pitch || rank(a.id) - rank(b.id) || a.id.localeCompare(b.id, "en", { numeric: true }));
}
