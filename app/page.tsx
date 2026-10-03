import { k } from "@/lib/i18n";
import { dictFor, requestLang, tr } from "@/lib/i18n-server";
import { I18nProvider } from "@/components/I18n";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignIn } from "@/components/SignIn";
import { hasDb } from "@/lib/db";
import { LogoMark } from "@/components/LogoMark";
import { googleOn } from "@/lib/google-env";
import { githubOn } from "@/lib/github-env";
import Link from "next/link";
import { RECIPE_TITLES } from "@/lib/recipe-titles";

// Plain entrance while the service is being built. The marketing page comes last (components/LandingDraft.tsx).
export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const tryR = typeof sp.try === "string" && RECIPE_TITLES[sp.try] ? sp.try : null;   // a friend's «send to a friend» link
  const jar = await cookies();
  if (jar.get("uc_s")?.value && hasDb()) redirect(tryR ? `/app?try=${tryR}` : "/app");
  const lang = await requestLang();
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center gap-6 px-5">
      <div className="flex items-center gap-2 font-semibold text-xl"><LogoMark /> Unchore</div>
      <p className="max-w-sm text-center text-fg-2">{tr(lang, "Runs on our servers — your reminders keep going even when your computer is off.")}</p>
      {tryR && <p className="max-w-sm text-center text-fg-2">{tr(lang, "A friend uses Unchore for «{recipe}». Sign in and it's set up for you in a minute.", { recipe: tr(lang, RECIPE_TITLES[tryR]!) })}</p>}
      {hasDb() ? <I18nProvider lang={lang} dict={dictFor(lang)}><SignIn lang={lang} googleOn={googleOn()} githubOn={githubOn()} /></I18nProvider>
        : <p className="text-fg-2">{tr(lang, "Coming soon.")}</p>}
      {/* 스트라이프 결제 심사가 첫 화면에서 요금·약관·환불·개인정보·연락처를 찾는다(2026-09-30) */}
      <footer className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-fg-2">
        {[["tools", k("Free tools")], ["about", k("About")], ["pricing", k("Pricing")], ["terms", k("Terms")], ["refund", k("Refunds")], ["privacy", k("Privacy")], ["contact", k("Contact")]].map(([h, l]) => <Link key={h} href={`/${h}`} className="underline">{tr(lang, l!)}</Link>)}
        <span className="w-full text-center">© 2026 Unchore, Inc.</span>
      </footer>
    </main>
  );
}
