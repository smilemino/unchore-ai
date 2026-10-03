"use client";
import { useState } from "react";
import { useT } from "@/components/I18n";
import { k } from "@/lib/i18n";
import type { SiteReport } from "@/lib/free-tools/site-check";

const WHAT: Record<string, [string, string]> = {
  https: [k("Encrypted connection (HTTPS)"), k("Without it, anyone on the same network can read or change the page.")],
  hsts: [k("Always use HTTPS (HSTS)"), k("Tells browsers never to open the site without encryption.")],
  csp: [k("Content Security Policy"), k("Limits which scripts may run — the main shield against injected code.")],
  frames: [k("Can't be framed by other sites"), k("Stops another site from showing yours inside a frame to trick clicks.")],
  nosniff: [k("No content-type guessing (nosniff)"), k("Stops browsers from treating an upload as a script.")],
  referrer: [k("Referrer policy"), k("Controls what address is passed on when someone clicks a link out.")],
  permissions: [k("Permissions policy"), k("Turns off camera, microphone and location for pages that don't need them.")],
  cookies: [k("Cookies marked Secure, HttpOnly and SameSite"), k("Keeps sign-in cookies away from scripts and other sites.")],
  version: [k("Server version hidden"), k("Showing exact software versions helps attackers pick a known hole.")],
};

export function SiteCheck() {
  const t = useT();
  const [url, setUrl] = useState(""), [busy, setBusy] = useState(false), [r, setR] = useState<SiteReport | null>(null), [err, setErr] = useState("");
  async function go(e: React.FormEvent) {
    e.preventDefault(); if (!url.trim()) return;
    setBusy(true); setErr(""); setR(null);
    const res = await fetch(`/api/free/site-check?url=${encodeURIComponent(url.trim())}`).then(async (x) => ({ status: x.status, j: await x.json().catch(() => ({})) })).catch(() => ({ status: 0, j: {} }));
    setBusy(false);
    if (res.status === 429) return setErr(t("That's a lot of checks in a short time. Try again in a few minutes."));
    if (res.j.error === "bad_address") return setErr(t("That doesn't look like a public web address. Try something like example.com."));
    if (res.j.error) return setErr(t("Couldn't reach that site. Check the address and try again."));
    setR(res.j as SiteReport);
  }
  return (
    <section className="flex flex-col gap-4">
      <form onSubmit={go} className="flex gap-2">
        <input className="flex-1 rounded-lg border border-line bg-surface px-3 py-2" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="example.com" inputMode="url" data-testid="site-input" />
        <button disabled={busy} className="rounded-lg bg-ink text-on-ink px-4 py-2 disabled:opacity-50">{busy ? "…" : t("Check")}</button>
      </form>
      {err && <p className="rounded-lg bg-warn-bg text-warn-fg px-3 py-2">{err}</p>}
      {r && <div className="flex flex-col gap-2" data-testid="site-report">
        <div className="rounded-xl bg-panel px-4 py-3"><div className="text-3xl font-bold">{r.grade} <span className="text-base font-normal text-fg-2">{t("{score} of 100", { score: r.score })}</span></div><div className="text-sm text-fg-2 break-all">{r.url} · HTTP {r.status}</div></div>
        <ul className="flex flex-col gap-1.5">{r.findings.map((f) => (
          <li key={f.id} className="rounded-lg border border-line-soft bg-surface px-3 py-2"><div className="font-medium">{f.ok ? "✅" : "⚠️"} {t(WHAT[f.id]![0])}</div><div className="text-sm text-fg-2">{t(WHAT[f.id]![1])}</div></li>))}</ul>
        <p className="text-xs text-fg-2">{t("This reads the headers of one page, once. It is not a full security test. It only checks what anyone can see from outside.")}</p>
      </div>}
    </section>
  );
}
