"use client";
import { useEffect, useState } from "react";
import { TZ_COOKIE } from "@/lib/tz";
import type { Lang } from "@/lib/i18n";
import { useT } from "./I18n";

export function SignIn({ lang, googleOn, githubOn = false }: { lang: Lang; googleOn: boolean; githubOn?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(!googleOn);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [err, setErr] = useState("");
  // Tell the server this browser's time zone so a new account starts in it (read once at sign-in).
  const saveTz = () => { try { document.cookie = `${TZ_COOKIE}=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}; path=/; max-age=3600; samesite=lax`; } catch { /* old browser — server falls back */ } };
  useEffect(saveTz, []);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const r = await fetch("/api/auth/email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, lang }) }).catch(() => null);
    if (r?.ok) setState("sent");
    else {
      const why = r?.status === 429 ? ((await r.json().catch(() => ({}))) as { error?: string }).error : undefined;
      setState("error");
      setErr(t(why === "wait" ? "A link was just sent. Check your mail, or try again in a minute." : why === "busy" ? "Lots of sign-in requests right now. Try again in a few minutes." : r?.status === 429 ? "Too many links — try again later." : "Couldn't send the link. Please try again."));
    }
  }
  return (
    <div className="flex flex-col gap-3 w-full max-w-sm">
      {googleOn && (
        <a href="/api/auth/google/start" onClick={saveTz} className="flex items-center justify-center gap-2 rounded-xl bg-ink text-on-ink px-5 py-3 font-medium hover:opacity-90">
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
          {t("Continue with Google")}
        </a>
      )}
      {githubOn && (
        <a href="/api/auth/github/start" onClick={saveTz} className="flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-5 py-3 font-medium hover:bg-hover">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
          {t("Continue with GitHub")}
        </a>
      )}
      {/* Google only once Google sign-in is set up (대표 결정 2026-09-29); the e-mail link is the stand-in until then. */}
      {googleOn ? null : !open ? (
        <button onClick={() => setOpen(true)} className="text-sm text-fg-2 underline underline-offset-4">{t("Get a sign-in link by e-mail")}</button>
      ) : state === "sent" ? (
        <p className="text-sm rounded-lg bg-accent-bg p-3">{t("Check your inbox — the link works once, for 15 minutes.")}</p>
      ) : (
        <form onSubmit={send} className="flex gap-2">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("you@company.com")}
            className="flex-1 rounded-xl border border-line bg-surface px-3 py-2.5 outline-none focus:border-fg-2" />
          <button disabled={state === "sending"} className="rounded-xl border border-line bg-surface px-4 py-2.5 hover:bg-hover disabled:opacity-50">{t("Send link")}</button>
        </form>
      )}
      {state === "error" && <p className="text-sm text-red-600">{err}</p>}
    </div>
  );
}

export function Waitlist({ lang }: { lang: Lang }) {
  const t = useT();
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  async function join(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/waitlist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, lang, source: "landing" }) }).catch(() => null);
    if (r?.ok) setDone(true);
  }
  if (done) return <p className="text-sm">{t("You're on the list.")}</p>;
  return (
    <form onSubmit={join} className="flex gap-2 w-full max-w-sm">
      <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("you@company.com")}
        className="flex-1 rounded-xl border border-line bg-surface px-3 py-2.5 outline-none focus:border-fg-2" />
      <button className="rounded-xl bg-ink text-on-ink px-4 py-2.5">{t("Join the waitlist")}</button>
    </form>
  );
}
