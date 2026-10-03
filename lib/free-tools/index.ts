// Free tools (benchmark 2026-10-01, «low-involvement web»: one job, one screen, no sign-up — found in search, then Unchore
// does it every time). The only pages Google may index before the public page (owner «yes» 2026-10-01 00:19, 1st choice).
// English and Korean are indexed first; the other 56 languages open for visitors but stay out of search until they prove out.
import { k, isLang, type Lang } from "../i18n";

export type Tool = { slug: string; emoji: string; title: string; blurb: string; ask: string };
export const TOOLS: Tool[] = [
  { slug: "chore-cost", emoji: "⏱", title: k("What does a chore cost you?"), blurb: k("Minutes × how often → hours and money a year."), ask: k("I do a chore by hand again and again. Help me make it run by itself.") },
  { slug: "ai-cost", emoji: "🤖", title: k("AI cost calculator"), blurb: k("What Claude, GPT, Gemini and others cost a month — live prices."), ask: k("Help me pick the right AI for my budget and connect it.") },
  { slug: "automation-ideas", emoji: "💡", title: k("What could run by itself in my week?"), blurb: k("Pick your role, get chores you can hand off today."), ask: k("Look at my week and find the chores you could take off my hands.") },
  { slug: "cron", emoji: "🗓", title: k("Cron ↔ plain words"), blurb: k("Read or write a cron schedule, and see the next runs."), ask: k("Remind me of something every day") },
  { slug: "site-check", emoji: "🔒", title: k("Website security check"), blurb: k("Security headers and cookie flags of any site, in plain words."), ask: k("Check my website's security every week and tell me when something changes.") },
  { slug: "chore-type", emoji: "🧩", title: k("What kind of chore-doer are you?"), blurb: k("Six quick picks. Share your type with a friend."), ask: k("Find the chores in my week you could take off my hands.") },
];
export const toolBySlug = (s: string) => TOOLS.find((t) => t.slug === s);

/** Languages Google may index now. */
export const INDEXED: readonly Lang[] = ["en", "ko"];

/** «?hl=ko» picks the language (a link for each language); else the visitor's own. */
export function hlOf(sp: Record<string, string | string[] | undefined>): Lang | null {
  const v = typeof sp.hl === "string" ? sp.hl : null;
  return isLang(v) ? v : null;
}

/** Address of a tool page in a language (English has no «hl»). */
export const toolPath = (slug: string | null, lang: Lang) => `/tools${slug ? `/${slug}` : ""}${lang === "en" ? "" : `?hl=${lang}`}`;

/** Search settings for a tool page: indexed only in English and Korean, each language its own address. */
export function toolMeta(slug: string | null, lang: Lang, hl: Lang | null, title: string, description: string) {
  const self = toolPath(slug, hl ?? "en");
  return {
    title: `${title} — Unchore`,
    description,
    alternates: { canonical: self, languages: { en: toolPath(slug, "en"), ko: toolPath(slug, "ko"), "x-default": toolPath(slug, "en") } },
    robots: { index: INDEXED.includes(hl ?? "en") && (hl ?? "en") === lang, follow: true },
    openGraph: { title, description, url: `https://unchore.ai${self}`, siteName: "Unchore", type: "website" as const },
  };
}
