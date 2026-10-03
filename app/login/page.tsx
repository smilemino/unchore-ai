import { k } from "@/lib/i18n";
import { dictFor, requestLang, tr } from "@/lib/i18n-server";
import { I18nProvider } from "@/components/I18n";
import Link from "next/link";
import { SignIn } from "@/components/SignIn";
import { hasDb } from "@/lib/db";
import { LogoMark } from "@/components/LogoMark";
import { googleOn } from "@/lib/google-env";
import { githubOn } from "@/lib/github-env";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { GOOGLE_HINT_COOKIE, hintLapsed, openGoogleHint } from "@/lib/google-hint";

const MSG: Record<string, string> = {
  link_expired: k("That link has expired or was already used. Get a new one below."),
  google_off: k("Google sign-in isn't switched on yet — use an e-mail link for now."),
  github_off: k("GitHub sign-in isn't switched on yet — please use another way to sign in."),
  github_email: k("Your GitHub account has no verified e-mail address. Verify one on GitHub, or sign in another way."),
};

export default async function Login({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const sp = await searchParams;
  // This device came in with Google and that sign-in ran out by itself (30 days unused): ask Google quietly, no button (lib/google-hint.ts)
  if (!sp.e && hasDb() && googleOn()) {
    const h = openGoogleHint((await cookies()).get(GOOGLE_HINT_COOKIE)?.value);
    if (h && await hintLapsed(h)) redirect("/api/auth/google/start?silent=1");
  }
  const lang = await requestLang();
  const m = sp.e && sp.e !== "silent" ? (tr(lang, MSG[sp.e] ?? k("Sign-in didn't go through. Please try again."))) : null;
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center gap-6 px-5">
      <div className="flex flex-col items-center gap-2 text-center">
        <Link href="/" className="flex items-center gap-2 text-3xl font-bold"><LogoMark /> Unchore</Link>
        <p className="max-w-sm text-sm text-fg-2">{tr(lang, "Ask anything. If it repeats, Unchore offers to automate it — and builds it.")}</p>
        {/* Benchmark 2026-09-30: every «AI at work» talk says «move to the terminal — but it's hard at first». This is the other way. */}
        <p className="max-w-sm text-sm font-medium">{tr(lang, "No terminal, no code — say what you do, and it becomes a skill that runs for you.")}</p>
      </div>
      {m && <p className="max-w-sm rounded-lg bg-warn-bg text-warn-fg p-3 text-sm">{m}</p>}
      {hasDb() ? <I18nProvider lang={lang} dict={dictFor(lang)}><SignIn lang={lang} googleOn={googleOn()} githubOn={githubOn()} /></I18nProvider>
        : <p className="max-w-sm text-center text-fg-2">{tr(lang, "Sign-in opens very soon. Join the waitlist on the home page meanwhile.")}</p>}
    </main>
  );
}
