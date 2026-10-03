"use client";
// «Your month» (benchmark 2026-10-01, play type — a result worth showing): how many checks Unchore did for the member in
// the last 30 days, the time that roughly saves, and one tap to send a friend a link (only a recipe name travels).
import { useState } from "react";
import { useLang, useT } from "./I18n";
import { RECIPE_TITLES } from "@/lib/recipe-titles";

type A = { id: string; recipe: string; runs30?: number; args?: { kind?: string } | null };
/** Minutes a person spends on one check by hand — a rough, stated guess (opening a site, finding the number, noting it). */
export const MINUTES_PER_CHECK = 2;

export function MonthCard({ list }: { list: A[] }) {
  const t = useT(), lang = useLang();
  const [note, setNote] = useState("");
  const n = list.reduce((s, a) => s + (a.runs30 ?? 0), 0);
  if (!n) return null;
  const hours = Math.round((n * MINUTES_PER_CHECK) / 6) / 10;
  const top = [...list].filter((a) => RECIPE_TITLES[a.recipe] && a.args?.kind !== "nudge").sort((a, b) => (b.runs30 ?? 0) - (a.runs30 ?? 0))[0];
  async function share() {
    const text = t("Unchore did {n} checks for me in the last 30 days — about {h} hours I didn't spend. Try it:", { n: n.toLocaleString(lang), h: hours.toLocaleString(lang) });
    const r = top ? await fetch("/api/share", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ automationId: top.id }) }).then((x) => x.ok ? x.json() : null).catch(() => null) : null;
    const url = r?.url ?? "https://unchore.ai/";
    try { if (navigator.share) { await navigator.share({ title: "Unchore", text, url }); return; } } catch { /* closed */ }
    try { await navigator.clipboard.writeText(`${text} ${url}`); setNote(t("Link copied — paste it to a friend.")); } catch { setNote(url); }
  }
  return (
    <section className="rounded-lg border border-line-soft bg-surface px-4 py-3 flex flex-col gap-1" data-testid="month-card">
      <div className="font-semibold">📊 {t("Your last 30 days")}</div>
      <div>{t("Unchore did {n} checks for you — about {h} hours you didn't spend.", { n: n.toLocaleString(lang), h: hours.toLocaleString(lang) })}</div>
      <div className="text-xs text-muted">{t("Counted as {m} minutes per check you'd otherwise do by hand — a rough guess.", { m: MINUTES_PER_CHECK })}</div>
      <button onClick={share} className="self-start mt-1 rounded-lg border border-line px-3 py-1 text-sm hover:bg-hover">🎁 {t("Share my month")}</button>
      {note && <span className="text-xs text-fg-2 break-all">{note}</span>}
    </section>
  );
}
