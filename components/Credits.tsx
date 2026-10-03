"use client";
import { useEffect, useState } from "react";
import { k } from "@/lib/i18n";
import { useT } from "./I18n";
import { Markdown } from "./Markdown";

// Settings → AI → Unchore credit (2026-09-30 owner «yes»): no key needed — Unchore pays the AI up front and takes what it
// cost, with no markup, from the member's prepaid balance; each top-up adds a fee (OpenRouter's shape, owner 2026-09-30 20:56). Also: keys for outside tools and the in-app security check.

type Credit = {
  micro: number; paid: boolean; on: boolean; topup: boolean; packs: number[]; pays: number[]; fee_pct: number; fee_usd: number;
  welcome_usd: number; welcome_max: number; welcome_left: number;
  history: { delta_micro: number; kind: string; note: string | null; created_at: string }[];
  tokens: { id: string; hint: string; created_at: string; last_used_at: string | null }[];
};
const usd = (micro: number) => `${micro < 0 ? "−" : ""}$${(Math.abs(micro) / 1_000_000).toFixed(2)}`;
const KIND: Record<string, string> = { welcome: k("Welcome credit"), topup: k("Top-up"), use: k("AI use"), refund: k("Refund"), adjust: k("Adjustment") };

export function Credits() {
  const t = useT();
  const [c, setC] = useState<Credit | null>(null);
  const [fresh, setFresh] = useState("");
  const [copied, setCopied] = useState(false);
  const [q, setQ] = useState("");
  const [mat, setMat] = useState("");
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<{ answer?: string; line: string } | null>(null);
  const load = () => fetch("/api/credits").then((r) => (r.ok ? r.json() : null)).then(setC).catch(() => {});
  useEffect(() => { void load(); }, []);
  // «🛡 Security check» on the empty first screen (plan v11 §13 E) opens here: scroll to it and put the cursor in the question.
  useEffect(() => {
    if (!c || window.location.hash !== "#security-check") return;
    document.getElementById("security-check")?.scrollIntoView({ block: "start" });
    (document.querySelector('[data-testid="defend-q"]') as HTMLInputElement | null)?.focus();
  }, [c]);
  if (!c) return null;
  const btn = "rounded-lg border border-line-2 px-3 py-1 text-sm hover:bg-hover disabled:opacity-40";
  const input = "rounded-lg border border-line bg-surface px-2 py-1.5 text-sm outline-none focus:border-fg-2";

  async function buy(p: number) {
    const r = await fetch("/api/credits/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ usd: p }) });
    const j = await r.json().catch(() => ({}));
    if (j.url) window.location.assign(j.url); else alert(t("Top-up couldn't open. Please try again."));
  }
  async function newKey() {
    const r = await fetch("/api/credits", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const j = await r.json().catch(() => ({}));
    if (j.token) { setFresh(j.token); setCopied(false); void load(); } else alert(t("You already have 5 keys — revoke one first."));
  }
  async function check() {
    setBusy(true); setOut(null);
    const r = await fetch("/api/defend", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: q, ...(mat.trim() ? { material: mat } : {}) }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!j.answer) { setOut({ line: `⚠ ${j.message ?? t("Couldn't check it. Please try again.")}` }); return; }
    const paid = j.paid_with === "own_key" ? t("paid with your OpenRouter key") : t("cost {usd} · left {left}", { usd: `$${Number(j.charged_usd).toFixed(2)}`, left: `$${Number(j.balance_usd).toFixed(2)}` });
    setOut({ answer: j.answer, line: t("Answered by {ai} · {n} item(s) masked · {paid}", { ai: j.answered_by, n: j.masked, paid }) });
    void load();
  }

  return (
    <section id="credits" className="mb-6 flex flex-col gap-2 scroll-mt-4" data-testid="credits">
      <h2 className="font-bold">{t("Unchore credit")} <span className="font-normal text-muted">— {t("no key needed")}</span></h2>
      <p className="text-sm text-fg-2">{t("Unchore pays the AI and takes exactly what it cost from this balance — no markup. Each top-up adds a {pct}% + {fee} fee.", { pct: c.fee_pct, fee: `$${c.fee_usd.toFixed(2)}` })} {c.welcome_left > 0
        ? <>{t("New accounts start with {usd} free for the natural voice that reads answers aloud.", { usd: `$${c.welcome_usd}` })} {t("First {max} members only — {left} left.", { max: c.welcome_max, left: c.welcome_left })}</>
        : t("The free welcome credit went to the first {max} members.", { max: c.welcome_max })}</p>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>{t("Balance")}</span><b className="text-base" data-testid="credit-balance">{usd(c.micro)}</b>
        {c.topup ? c.packs.map((p, i) => <button key={p} type="button" className={btn} onClick={() => buy(p)}>+ ${p} <span className="text-xs text-subtle">{t("pay {usd}", { usd: `$${c.pays[i]?.toFixed(2)}` })}</span></button>)
          : <span className="text-xs text-subtle">{t("Top-up opens soon — until then, the welcome credit or your own OpenRouter key.")}</span>}
      </div>
      {c.history.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-subtle">{t("Recent")}</summary>
          <div className="mt-1 flex flex-col gap-0.5">
            {c.history.map((h, i) => <div key={i} className="flex gap-2"><span className="text-muted w-24 shrink-0">{new Date(h.created_at).toLocaleDateString()}</span><span className="flex-1">{t(h.kind === "use" && h.note === "Google voice" ? k("Natural voice") : KIND[h.kind] ?? k("Adjustment"))}</span><span className={h.delta_micro < 0 ? "" : "text-emerald-700 dark:text-emerald-400"}>{usd(h.delta_micro)}</span></div>)}
          </div>
        </details>
      )}

      <h3 id="security-check" className="mt-2 font-semibold text-sm scroll-mt-4">{t("Security check")}</h3>
      <p className="text-xs text-subtle">{t("Paste a log, code or a suspicious message and ask what happened. Personal data and secrets are masked first; if one AI refuses, the next one answers.")}</p>
      {!c.on && <p className="text-xs text-subtle">{t("Unchore credit isn't switched on yet — this uses your own OpenRouter key for now.")}</p>}
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("What happened? e.g. «Who got in, and what did they take?»")} className={input} data-testid="defend-q" />
      <textarea value={mat} onChange={(e) => setMat(e.target.value)} rows={mat.includes("\n") ? 6 : 2} placeholder={t("Log, code or message (optional)")} className={`${input} font-mono text-xs resize-y`} />
      <button type="button" className="w-fit rounded-lg bg-ink text-on-ink px-4 py-1.5 text-sm disabled:opacity-40" disabled={busy || q.trim().length < 3} onClick={check}>{busy ? t("Checking…") : t("Check")}</button>
      {out && <div className="rounded-lg border border-line-soft p-3 text-sm"><div className="text-xs text-subtle mb-1">{out.line}</div>{out.answer && <Markdown text={out.answer} />}</div>}

      <h3 className="mt-2 font-semibold text-sm">{t("Keys for tools")}</h3>
      <p className="text-xs text-subtle">{t("Use Unchore credit from Claude Code, Codex or your own scripts (the «unchore-defend» skill). A new key is shown once — copy it now.")}</p>
      {fresh && <div className="flex items-center gap-2 text-xs"><code className="flex-1 break-all rounded bg-pill px-2 py-1">{fresh}</code><button type="button" className={btn} onClick={() => { void navigator.clipboard?.writeText(fresh); setCopied(true); }}>{copied ? t("Copied") : t("Copy")}</button></div>}
      {c.tokens.map((x) => (
        <div key={x.id} className="flex items-center gap-2 text-sm"><code>{x.hint}</code><span className="flex-1 text-xs text-muted">{x.last_used_at ? t("last used {when}", { when: new Date(x.last_used_at).toLocaleDateString() }) : t("never used")}</span>
          <button type="button" className={btn} onClick={async () => { await fetch(`/api/credits?token=${x.id}`, { method: "DELETE" }); if (fresh.endsWith(x.hint.slice(-4))) setFresh(""); void load(); }}>{t("Revoke")}</button></div>
      ))}
      <button type="button" className={`${btn} w-fit`} onClick={newKey}>+ {t("New key")}</button>
    </section>
  );
}
