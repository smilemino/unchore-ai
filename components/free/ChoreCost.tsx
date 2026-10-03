"use client";
import { useState } from "react";
import { useLang, useT } from "@/components/I18n";
import { choreCost, type Per } from "@/lib/free-tools/chore";

const box = "rounded-lg border border-line bg-surface px-3 py-2";
export function ChoreCost() {
  const t = useT(), lang = useLang();
  const [minutes, setMinutes] = useState("10"), [times, setTimes] = useState("1"), [per, setPer] = useState<Per>("workday"), [hourly, setHourly] = useState("");
  const r = choreCost({ minutes: Number(minutes), times: Number(times), per, hourly: hourly ? Number(hourly) : undefined });
  const nf = (n: number) => n.toLocaleString(lang);
  return (
    <section className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">{t("Minutes it takes each time")}<input className={box} inputMode="decimal" value={minutes} onChange={(e) => setMinutes(e.target.value)} /></label>
        <label className="flex flex-col gap-1 text-sm">{t("How many times")}<div className="flex gap-2"><input className={`${box} w-24`} inputMode="decimal" value={times} onChange={(e) => setTimes(e.target.value)} />
          <select className={box} value={per} onChange={(e) => setPer(e.target.value as Per)}>
            <option value="day">{t("a day")}</option><option value="workday">{t("a working day")}</option><option value="week">{t("a week")}</option><option value="month">{t("a month")}</option>
          </select></div></label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">{t("What an hour of your time is worth (optional, any currency)")}<input className={box} inputMode="decimal" value={hourly} onChange={(e) => setHourly(e.target.value)} placeholder="50" /></label>
      </div>
      <div className="rounded-xl bg-panel px-4 py-3 flex flex-col gap-1" data-testid="chore-result">
        <div className="text-2xl font-semibold">{t("{h} hours a year", { h: nf(r.hoursYear) })}</div>
        <div className="text-fg-2">{t("That's {d} full working days (8 hours each) — {h5} hours over five years.", { d: nf(r.daysYear), h5: nf(r.hours5y) })}</div>
        {r.moneyYear !== null && <div className="text-fg-2">{t("Worth about {m} a year at your hourly value.", { m: nf(r.moneyYear) })}</div>}
      </div>
    </section>
  );
}
