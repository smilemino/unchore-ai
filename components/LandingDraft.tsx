import { dictFor, trFor } from "@/lib/i18n-server";
import { I18nProvider } from "./I18n";
import { cookies, headers } from "next/headers";
import Link from "next/link";
import { SignIn, Waitlist } from "@/components/SignIn";
import { isLang, pickLang } from "@/lib/i18n";
import { hasDb } from "@/lib/db";
import { LogoMark } from "./LogoMark";
import { googleOn as googleOnEnv } from "@/lib/google-env";
import { githubOn } from "@/lib/github-env";

// Marketing landing — parked on purpose (대표 결정 2026-09-29 10:05: build the landing last, after the service is done). Not routed.
export default async function LandingDraft({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const sp = await searchParams;
  const h = await headers();
  const jar = await cookies();
  const lang = isLang(sp.lang) ? sp.lang : pickLang(h.get("accept-language"), jar.get("uc_lang")?.value, h.get("x-vercel-ip-country"));
  const t = trFor(lang);
  const signedIn = Boolean(jar.get("uc_s")?.value);
  const googleOn = googleOnEnv();
  return (
    <I18nProvider lang={lang} dict={dictFor(lang)}><main className="min-h-dvh">
      <header className="mx-auto max-w-5xl flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2 font-semibold text-lg"><LogoMark /> Unchore</div>
        <nav className="flex items-center gap-4 text-sm text-fg-2">
          {lang !== "en" && <Link href="/?lang=en">English</Link>}
          <Link href="/status">Status</Link>
          {signedIn && <Link href="/app" className="rounded-lg bg-ink text-on-ink px-3 py-1.5">{t("Open app")}</Link>}
        </nav>
      </header>

      <section className="mx-auto max-w-5xl px-5 pt-10 pb-16 grid gap-10 md:grid-cols-2 items-center">
        <div className="flex flex-col gap-6">
          <h1 className="text-4xl md:text-5xl font-semibold leading-tight tracking-tight">{t("Ask anything. If it repeats, Unchore does it for you.")}</h1>
          <p className="text-lg text-fg-2 leading-relaxed">{t("Unchore answers like any AI. Then, when it's something you'll need again — a price, a fare, a deadline — it offers to take care of it from now on, and builds the automation itself.")}</p>
          {signedIn ? <Link href="/app" className="w-fit rounded-xl bg-ink text-on-ink px-5 py-3 font-medium">{t("Open app")}</Link> : hasDb() ? <SignIn lang={lang} googleOn={googleOn} githubOn={githubOn()} /> : <Waitlist lang={lang} />}
        </div>
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm flex flex-col gap-3 text-[15px]">
          {/* The example works everywhere (coin price in dollars); Korean keeps its own Korean price-site example in ko.json. */}
          <div className="self-end max-w-[85%] rounded-2xl bg-bubble px-4 py-2.5">{t("What's Bitcoin at right now?")}</div>
          <div className="max-w-[92%] px-1">{t("$64,210 on Coinbase — spot price, read just now.")}</div>
          <div className="rounded-xl border border-accent/40 bg-accent-bg p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2 font-medium"><span aria-hidden>⚡</span>{t("Want me to check every morning and tell you when it drops under $60,000?")}</div>
            <div className="flex gap-2"><span className="rounded-lg bg-ink text-on-ink px-3 py-1.5 text-sm">{t("Yes, automate it")}</span></div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-12">
        <h2 className="text-2xl font-semibold mb-6">{t("How it works")}</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {[[t("Ask"), t("Chat like you always do. You get the answer first.")], [t("Say yes"), t("If it's worth repeating, Unchore offers once. One tap.")], [t("Forget it"), t("It runs on schedule and pings you only when it matters.")]].map(([a, b], i) => (
            <div key={i} className="rounded-2xl border border-line bg-surface p-5"><div className="text-sm text-muted mb-1">{i + 1}</div><div className="font-semibold mb-1">{a}</div><div className="text-fg-2">{b}</div></div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-12">
        <h2 className="text-2xl font-semibold mb-6">{t("Built so you can trust it")}</h2>
        <ul className="grid gap-3 md:grid-cols-2">
          {[t("Every number shows where it came from."), t("Not sure? It stops and tells you instead of guessing."), t("Never pays, sends or deletes without your yes."), t("Your AI key and saved logins are encrypted.")].map((x) => <li key={x} className="rounded-xl bg-panel px-4 py-3">✓ {x}</li>)}
        </ul>
        <p className="mt-6 text-fg-2">{t("Bring your own Claude, GPT or OpenRouter key. You pay your AI provider directly — Unchore is free during the beta.")}</p>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-12 flex flex-col gap-4">
        <h2 className="text-xl font-semibold">{t("Want the desktop runner and team edition first?")}</h2>
        <Waitlist lang={lang} />
      </section>

      <footer className="mx-auto max-w-5xl px-5 py-10 text-sm text-muted flex justify-between">
        <span>{t("Humans do the creative work. AI does the chores.")}</span><span>© 2026 Unchore</span>
      </footer>
    </main></I18nProvider>
  );
}
