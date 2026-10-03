// Languages of the app (2026-09-30 owner: «used in 100 countries — the visitor's language picked automatically»).
// Client-safe: no translation files here. Screens get their language's dictionary from the server
// (lib/i18n-server.ts → components/I18n.tsx); server code uses tr()/trFor() from lib/i18n-server.ts.
// Keys are the English text itself: t("Sign out"). A missing translation shows the English, never a blank.

export type LangInfo = { code: string; name: string; en: string; speech: string; rtl?: boolean; countries: string[] };

/** 58 languages. `countries` = where this language is the fallback when the browser's own language isn't one of ours. */
export const LANGS = [
  { code: "en", name: "English", en: "English", speech: "en-US", countries: ["US", "GB", "CA", "AU", "NZ", "IE", "ZA", "NG", "GH", "KE", "UG", "ZW", "ZM", "JM", "TT", "BS", "BB", "SG", "MT", "BZ", "GY", "LR", "SL", "BW", "NA", "MW", "RW", "IN", "PK", "PH", "FJ", "PG", "SS", "GM", "LS", "SZ", "MU", "SC"] },
  { code: "ko", name: "한국어", en: "Korean", speech: "ko-KR", countries: ["KR", "KP"] },
  { code: "ja", name: "日本語", en: "Japanese", speech: "ja-JP", countries: ["JP"] },
  { code: "zh-CN", name: "简体中文", en: "Chinese (Simplified)", speech: "zh-CN", countries: ["CN"] },
  { code: "zh-TW", name: "繁體中文", en: "Chinese (Traditional)", speech: "zh-TW", countries: ["TW", "HK", "MO"] },
  { code: "es", name: "Español", en: "Spanish", speech: "es-ES", countries: ["ES", "MX", "AR", "CO", "PE", "VE", "CL", "EC", "GT", "CU", "BO", "DO", "HN", "PY", "SV", "NI", "CR", "PA", "UY", "PR", "GQ"] },
  { code: "pt", name: "Português (Brasil)", en: "Portuguese (Brazil)", speech: "pt-BR", countries: ["BR", "PT", "AO", "MZ", "CV", "GW", "ST", "TL"] },
  { code: "fr", name: "Français", en: "French", speech: "fr-FR", countries: ["FR", "LU", "MC", "SN", "CI", "ML", "BF", "NE", "TG", "BJ", "GN", "CD", "CG", "GA", "CM", "CF", "TD", "MG", "HT", "DJ", "KM", "BI"] },
  { code: "de", name: "Deutsch", en: "German", speech: "de-DE", countries: ["DE", "AT", "CH", "LI"] },
  { code: "it", name: "Italiano", en: "Italian", speech: "it-IT", countries: ["IT", "SM", "VA"] },
  { code: "nl", name: "Nederlands", en: "Dutch", speech: "nl-NL", countries: ["NL", "BE", "SR"] },
  { code: "ru", name: "Русский", en: "Russian", speech: "ru-RU", countries: ["RU", "BY", "KG", "TJ", "TM"] },
  { code: "uk", name: "Українська", en: "Ukrainian", speech: "uk-UA", countries: ["UA"] },
  { code: "pl", name: "Polski", en: "Polish", speech: "pl-PL", countries: ["PL"] },
  { code: "tr", name: "Türkçe", en: "Turkish", speech: "tr-TR", countries: ["TR"] },
  { code: "ar", name: "العربية", en: "Arabic", speech: "ar-SA", rtl: true, countries: ["SA", "AE", "EG", "IQ", "JO", "KW", "LB", "LY", "MA", "OM", "QA", "SY", "TN", "YE", "BH", "DZ", "SD", "PS", "MR"] },
  { code: "he", name: "עברית", en: "Hebrew", speech: "he-IL", rtl: true, countries: ["IL"] },
  { code: "fa", name: "فارسی", en: "Persian", speech: "fa-IR", rtl: true, countries: ["IR", "AF"] },
  { code: "hi", name: "हिन्दी", en: "Hindi", speech: "hi-IN", countries: [] },
  { code: "bn", name: "বাংলা", en: "Bengali", speech: "bn-BD", countries: ["BD"] },
  { code: "ur", name: "اردو", en: "Urdu", speech: "ur-PK", rtl: true, countries: [] },
  { code: "id", name: "Bahasa Indonesia", en: "Indonesian", speech: "id-ID", countries: ["ID"] },
  { code: "ms", name: "Bahasa Melayu", en: "Malay", speech: "ms-MY", countries: ["MY", "BN"] },
  { code: "th", name: "ไทย", en: "Thai", speech: "th-TH", countries: ["TH"] },
  { code: "vi", name: "Tiếng Việt", en: "Vietnamese", speech: "vi-VN", countries: ["VN"] },
  { code: "fil", name: "Filipino", en: "Filipino", speech: "fil-PH", countries: [] },
  { code: "sw", name: "Kiswahili", en: "Swahili", speech: "sw-TZ", countries: ["TZ"] },
  { code: "sv", name: "Svenska", en: "Swedish", speech: "sv-SE", countries: ["SE", "AX"] },
  { code: "nb", name: "Norsk", en: "Norwegian", speech: "nb-NO", countries: ["NO"] },
  { code: "da", name: "Dansk", en: "Danish", speech: "da-DK", countries: ["DK", "GL", "FO"] },
  { code: "fi", name: "Suomi", en: "Finnish", speech: "fi-FI", countries: ["FI"] },
  { code: "cs", name: "Čeština", en: "Czech", speech: "cs-CZ", countries: ["CZ"] },
  { code: "sk", name: "Slovenčina", en: "Slovak", speech: "sk-SK", countries: ["SK"] },
  { code: "hu", name: "Magyar", en: "Hungarian", speech: "hu-HU", countries: ["HU"] },
  { code: "ro", name: "Română", en: "Romanian", speech: "ro-RO", countries: ["RO", "MD"] },
  { code: "bg", name: "Български", en: "Bulgarian", speech: "bg-BG", countries: ["BG"] },
  { code: "el", name: "Ελληνικά", en: "Greek", speech: "el-GR", countries: ["GR", "CY"] },
  { code: "hr", name: "Hrvatski", en: "Croatian", speech: "hr-HR", countries: ["HR", "BA"] },
  { code: "sr", name: "Српски", en: "Serbian", speech: "sr-RS", countries: ["RS", "ME"] },
  { code: "sl", name: "Slovenščina", en: "Slovenian", speech: "sl-SI", countries: ["SI"] },
  { code: "lt", name: "Lietuvių", en: "Lithuanian", speech: "lt-LT", countries: ["LT"] },
  { code: "lv", name: "Latviešu", en: "Latvian", speech: "lv-LV", countries: ["LV"] },
  { code: "et", name: "Eesti", en: "Estonian", speech: "et-EE", countries: ["EE"] },
  { code: "ka", name: "ქართული", en: "Georgian", speech: "ka-GE", countries: ["GE"] },
  { code: "hy", name: "Հայերեն", en: "Armenian", speech: "hy-AM", countries: ["AM"] },
  { code: "az", name: "Azərbaycan", en: "Azerbaijani", speech: "az-AZ", countries: ["AZ"] },
  { code: "kk", name: "Қазақ", en: "Kazakh", speech: "kk-KZ", countries: ["KZ"] },
  { code: "uz", name: "Oʻzbek", en: "Uzbek", speech: "uz-UZ", countries: ["UZ"] },
  { code: "mn", name: "Монгол", en: "Mongolian", speech: "mn-MN", countries: ["MN"] },
  { code: "km", name: "ខ្មែរ", en: "Khmer", speech: "km-KH", countries: ["KH"] },
  { code: "lo", name: "ລາວ", en: "Lao", speech: "lo-LA", countries: ["LA"] },
  { code: "my", name: "မြန်မာ", en: "Burmese", speech: "my-MM", countries: ["MM"] },
  { code: "ne", name: "नेपाली", en: "Nepali", speech: "ne-NP", countries: ["NP"] },
  { code: "si", name: "සිංහල", en: "Sinhala", speech: "si-LK", countries: ["LK"] },
  { code: "am", name: "አማርኛ", en: "Amharic", speech: "am-ET", countries: ["ET"] },
  { code: "sq", name: "Shqip", en: "Albanian", speech: "sq-AL", countries: ["AL", "XK"] },
  { code: "mk", name: "Македонски", en: "Macedonian", speech: "mk-MK", countries: ["MK"] },
  { code: "is", name: "Íslenska", en: "Icelandic", speech: "is-IS", countries: ["IS"] },
] as const satisfies readonly LangInfo[];

export type Lang = (typeof LANGS)[number]["code"];
export const LANG_CODES: readonly Lang[] = LANGS.map((l) => l.code);
export const LANG_COOKIE = "uc_lang";

const BY_CODE = new Map<string, LangInfo>(LANGS.map((l) => [l.code, l]));
const BY_COUNTRY = new Map<string, Lang>(LANGS.flatMap((l) => l.countries.map((c) => [c, l.code] as [string, Lang])));
/** Old or regional browser codes → ours. */
const ALIAS: Record<string, Lang> = { zh: "zh-CN", "zh-hans": "zh-CN", "zh-sg": "zh-CN", "zh-my": "zh-CN", "zh-hant": "zh-TW", "zh-hk": "zh-TW", "zh-mo": "zh-TW", no: "nb", nn: "nb", tl: "fil", iw: "he", in: "id", bs: "hr", cnr: "sr", prs: "fa", ji: "en" };

export const isLang = (x: unknown): x is Lang => typeof x === "string" && BY_CODE.has(x);
/** Any stored or requested value → one of ours (unknown → English). */
export function asLang(x: string | null | undefined): Lang { return matchLang(x) ?? "en"; }
export const langInfo = (l: string): LangInfo => BY_CODE.get(l) ?? BY_CODE.get("en")!;
export const isRtl = (l: string): boolean => Boolean(langInfo(l).rtl);
/** For the browser's speech engines («ko» → «ko-KR»); a spoken language already like «ja-JP» stays. */
export const speechTag = (l: string): string => (l.includes("-") && !BY_CODE.has(l) ? l : langInfo(matchLang(l) ?? "en").speech);

/** «pt-BR», «ZH-hant-TW», «nn» → ours, or null. */
export function matchLang(tag: string | null | undefined): Lang | null {
  const t = (tag ?? "").trim().toLowerCase().replace(/_/g, "-");
  if (!t) return null;
  for (const l of LANGS) if (l.code.toLowerCase() === t) return l.code;
  const parts = t.split("-");
  if (parts[0] === "zh") {
    if (parts.includes("hant") || ["tw", "hk", "mo"].some((r) => parts.includes(r))) return "zh-TW";
    return "zh-CN";
  }
  const two = `${parts[0]}-${parts[1] ?? ""}`;
  const alias = ALIAS[two] ?? ALIAS[parts[0]!];
  if (alias) return alias;
  return isLang(parts[0]) ? parts[0] : null;
}

/** The country's language (ISO «FR» → «fr»), or null when we don't map it. */
export const countryLang = (country: string | null | undefined): Lang | null => BY_COUNTRY.get((country ?? "").trim().toUpperCase()) ?? null;

/**
 * Which language to show a visitor: 1 the one they picked (cookie), 2 their browser's languages in order of preference,
 * 3 the country they are in (Vercel's x-vercel-ip-country), 4 English.
 * The browser comes before the country: a Korean on a trip to Japan wants Korean, and in India, Switzerland or
 * Belgium the country alone doesn't say which language the person reads.
 */
export function pickLang(acceptLanguage: string | null | undefined, cookie?: string | null, country?: string | null): Lang {
  if (isLang(cookie)) return cookie;
  const wanted = (acceptLanguage ?? "").split(",")
    .map((p, i) => { const [tag, ...rest] = p.trim().split(";"); const q = Number(rest.find((r) => r.trim().startsWith("q="))?.trim().slice(2) ?? 1); return { tag: tag ?? "", q: Number.isFinite(q) ? q : 0, i }; })
    .filter((x) => x.tag && x.tag !== "*" && x.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i);
  for (const w of wanted) { const m = matchLang(w.tag); if (m) return m; }
  return countryLang(country) ?? "en";
}

/** Marks an English line as a translation key where it is defined (lists, tables) — t() is called on it later. */
export const k = <S extends string>(s: S): S => s;

export type Vars = Record<string, string | number>;
/** Translation lookup for one language: English text → that language. */
export type Dict = Record<string, string>;
export type TFn = (en: string, vars?: Vars) => string;

/** «{n} automations» + {n: 3} → «3 automations». Unknown names stay as written. */
export function fill(s: string, vars?: Vars): string {
  return vars ? s.replace(/\{(\w+)\}/g, (all, k: string) => (k in vars ? String(vars[k]) : all)) : s;
}
/** A key may carry a context after «#» when one English line needs two different translations («Paused#count»). */
/** Language plus its translator — what helpers shared by screens and server need (dates want the language, words want t). */
export type Tr = { lang: Lang; t: TFn };
export const makeT = (dict: Dict | null | undefined): TFn => (en, vars) => fill(dict?.[en] || en.replace(/#\w+$/, ""), vars);
