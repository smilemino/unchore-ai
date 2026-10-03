import { NextResponse } from "next/server";
import { isResp, requireUser } from "@/lib/api";
import { defaultVoice, localeFor, mainAccent, otherAccents } from "@/lib/voice/catalog";
import { allowance } from "@/lib/voice/google";

// Voice mode start: which Google voice to begin with for this language, which regional accents exist, and how much of
// today's allowance is left. «lang» is the phone/browser language at first, then the language heard in the user's first words.
export async function GET(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const lang = new URL(req.url).searchParams.get("lang")?.slice(0, 20) ?? u.lang;
  const locale = localeFor(lang);
  const a = await allowance(u.id, u.tz);
  return NextResponse.json({
    google: a.ok && a.speakLeft > 0 && a.credit, why: a.ok ? (a.speakLeft <= 0 ? "daily_limit" : a.credit ? null : "no_credit") : a.why,
    locale, voice: defaultVoice(locale), accent: locale === "*" ? "" : mainAccent(locale), accents: locale === "*" ? [] : otherAccents(locale),
    speakLeftSec: Math.round(a.speakLeft), hearLeftSec: Math.round(a.hearLeft),
  }, { headers: { "Cache-Control": "no-store" } });
}
