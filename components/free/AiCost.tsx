"use client";
import { useState } from "react";
import { useLang, useT } from "@/components/I18n";
import { SOURCE_URL, monthlyCost, type Model } from "@/lib/free-tools/ai-cost";

const box = "rounded-lg border border-line bg-surface px-3 py-2";
export function AiCost({ models, at }: { models: Model[]; at: string }) {
  const t = useT(), lang = useLang();
  const [perDay, setPerDay] = useState("30"), [wordsIn, setWordsIn] = useState("300"), [wordsOut, setWordsOut] = useState("250");
  const p = { perDay: Number(perDay), wordsIn: Number(wordsIn), wordsOut: Number(wordsOut) };
  const usd = (n: number) => n.toLocaleString(lang, { style: "currency", currency: "USD", maximumFractionDigits: n < 1 ? 3 : 2 });
  if (!models.length) return <p className="rounded-lg bg-warn-bg text-warn-fg px-3 py-2">{t("The live price list couldn't be read just now, so no prices are shown (we don't show guesses). Try again in a minute.")}</p>;
  const rows = [...models].sort((a, b) => monthlyCost(a, p) - monthlyCost(b, p));
  return (
    <section className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">{t("Messages a day")}<input className={box} inputMode="numeric" value={perDay} onChange={(e) => setPerDay(e.target.value)} /></label>
        <label className="flex flex-col gap-1 text-sm">{t("Words you send each time (with context)")}<input className={box} inputMode="numeric" value={wordsIn} onChange={(e) => setWordsIn(e.target.value)} /></label>
        <label className="flex flex-col gap-1 text-sm">{t("Words in each answer")}<input className={box} inputMode="numeric" value={wordsOut} onChange={(e) => setWordsOut(e.target.value)} /></label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="ai-cost-table">
          <thead><tr className="text-left text-fg-2"><th className="py-1 pr-3">{t("Model")}</th><th className="py-1 pr-3">{t("In / out per 1M tokens")}</th><th className="py-1">{t("A month")}</th></tr></thead>
          <tbody>{rows.map((m) => (
            <tr key={m.id} className="border-t border-line-soft"><td className="py-1.5 pr-3"><div>{m.name}</div><div className="text-xs text-muted">{m.id}</div></td>
              <td className="py-1.5 pr-3 whitespace-nowrap">{usd(m.inPerM)} / {usd(m.outPerM)}</td><td className="py-1.5 font-medium whitespace-nowrap">{usd(monthlyCost(m, p))}</td></tr>))}</tbody>
        </table>
      </div>
      <p className="text-xs text-fg-2">{t("Prices: OpenRouter's public model list ({src}), read {at}, refreshed daily. Tokens are estimated as words × 1.35 (English; other languages often use more). A month = 30 days. The AI company's own price can differ slightly.", { src: SOURCE_URL, at })}</p>
    </section>
  );
}
