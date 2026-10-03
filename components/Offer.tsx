"use client";
import { useState } from "react";
import { useT } from "./I18n";
import { ShareButton } from "./ShareButton";

export type Proposal = { id: string; propose: boolean; method: string; offer: string; status: string };
type Preview = { ok: boolean; line?: string; why?: string; url?: string; items?: string[] };
type Built = { automation: { id: string; title: string; schedule: string; recipe?: string }; preview: Preview };

export function OfferCard({ p }: { p: Proposal }) {
  const t = useT();
  const [state, setState] = useState<"ask" | "building" | "built" | "on" | "gone">(p.status === "accepted" ? "on" : p.status === "dismissed" ? "gone" : "ask");
  const [built, setBuilt] = useState<Built | null>(null);
  if (!p.propose || state === "gone") return null;
  async function yes() {
    setState("building");
    const r = await fetch("/api/automations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ proposalId: p.id }) });
    if (!r.ok) { setState("ask"); return; }
    setBuilt(await r.json());
    setState("built");
  }
  async function turnOn() {
    if (!built) return;
    const r = await fetch(`/api/automations/${built.automation.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "active" }) }).catch(() => null);
    if (r?.status === 409) { alert(t("You already have {n} automations on. Pause or delete one first, then turn this on.", { n: (await r.json().catch(() => ({}))).max ?? 30 })); return; }
    setState("on");
  }
  async function discard() {
    if (built) await fetch(`/api/automations/${built.automation.id}`, { method: "DELETE" });
    setState("gone");
  }
  const needsBrowser = built?.preview.why === "needs_browser";
  return (
    <div className="mt-3 rounded-xl border border-accent/40 bg-accent-bg p-4 flex flex-col gap-3 text-[15px]">
      <div className="flex items-start gap-2 font-medium"><span aria-hidden>⚡</span><span>{p.offer || t("Automate this?")}</span></div>
      {state === "ask" && (
        <div className="flex gap-2">
          <button onClick={yes} className="rounded-lg bg-ink text-on-ink px-3 py-1.5 text-sm">{t("Yes, set it up")}</button>
          <button onClick={() => setState("gone")} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm">{t("No thanks")}</button>
        </div>
      )}
      {state === "building" && <div className="text-sm text-fg-2 animate-pulse">{t("Picking a verified recipe and running it once…")}</div>}
      {state === "built" && built && (
        <div className="flex flex-col gap-2">
          <div className="text-sm font-medium">{built.automation.title}</div>
          {built.preview.ok ? (
            <>
              <div className="text-sm text-fg-2">{t("Here's what it found just now:")}</div>
              <div className="rounded-lg bg-surface border border-line px-3 py-2 text-sm">{built.preview.line}</div>
              {built.preview.url && <a href={built.preview.url} target="_blank" rel="noreferrer" className="text-xs text-muted underline">{t("Source")}: {new URL(built.preview.url).host}</a>}
            </>
          ) : (
            <div className="rounded-lg bg-warn-bg text-warn-fg px-3 py-2 text-sm">{needsBrowser ? t("This one needs the browser worker, which isn't connected yet. It will run as soon as it is.") : `${t("It couldn't read this with certainty:")} ${built.preview.why}`}</div>
          )}
          <div className="flex gap-2">
            {(built.preview.ok || needsBrowser) && <button onClick={turnOn} className="rounded-lg bg-ink text-on-ink px-3 py-1.5 text-sm">{t("Looks right — turn it on")}</button>}
            <button onClick={discard} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm">{t("Discard")}</button>
          </div>
        </div>
      )}
      {state === "on" && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <a href="/app/automations" className="underline">✓ {t("Automations")} →</a>
          {built?.automation.recipe && built.preview.ok && <ShareButton automationId={built.automation.id} recipe={built.automation.recipe} className="bg-surface" />}
        </div>
      )}
    </div>
  );
}
