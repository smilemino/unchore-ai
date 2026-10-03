"use client";
import { useState } from "react";
import { useLang, useT } from "@/components/I18n";
import { useClientValue } from "@/components/useClient";
import { DAY_NAMES, buildCron, describeCron, nextRuns, type Plan } from "@/lib/free-tools/cron";

const box = "rounded-lg border border-line bg-surface px-3 py-2";
export function CronTool() {
  const t = useT(), lang = useLang();
  const [expr, setExpr] = useState("30 9 * * 1-5");
  const [plan, setPlan] = useState<Plan>({ every: "weekdays", hour: 9, minute: 30, n: 15, day: 1, weekday: 1 });
  const browser = useClientValue(() => true, false);   // next runs and the time zone are the visitor's own — drawn in the browser only
  let words = "", runs: Date[] = [], bad = "";
  try { words = describeCron(expr, t); runs = browser ? nextRuns(expr, 5) : []; } catch (e) { bad = (e as Error).message; }
  const set = (p: Partial<Plan>) => { const n = { ...plan, ...p }; setPlan(n); setExpr(buildCron(n)); };
  const tz = browser ? Intl.DateTimeFormat().resolvedOptions().timeZone : "…";
  return (
    <section className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">{t("Cron line (minute hour day month weekday)")}
        <input className={`${box} font-mono`} value={expr} onChange={(e) => setExpr(e.target.value)} spellCheck={false} data-testid="cron-input" /></label>
      <div className="rounded-xl bg-panel px-4 py-3 flex flex-col gap-2" data-testid="cron-words">
        {bad ? <div className="text-warn-fg">⚠ {t("That isn't a cron line we can read")}: {bad}</div> : <>
          <div className="text-lg font-medium">{words}</div>
          <div className="text-sm text-fg-2">{t("Next runs (your time zone, {tz})", { tz })}:</div>
          <ul className="text-sm font-mono">{runs.map((d) => <li key={d.getTime()}>{d.toLocaleString(lang, { weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</li>)}</ul>
        </>}
      </div>
      <div className="flex flex-col gap-2">
        <div className="text-sm font-medium">{t("Or build one from plain choices")}</div>
        <div className="flex flex-wrap gap-2 items-center text-sm">
          <select className={box} value={plan.every} onChange={(e) => set({ every: e.target.value as Plan["every"] })}>
            <option value="minutes">{t("Every few minutes")}</option><option value="hour">{t("Every hour")}</option><option value="day">{t("Every day")}</option>
            <option value="weekdays">{t("Weekdays")}</option><option value="week">{t("Once a week")}</option><option value="month">{t("Once a month")}</option>
          </select>
          {plan.every === "minutes" && <label className="flex items-center gap-1">{t("every")}<input className={`${box} w-20`} inputMode="numeric" value={plan.n} onChange={(e) => set({ n: Number(e.target.value) })} />{t("minutes")}</label>}
          {plan.every === "week" && <select className={box} value={plan.weekday} onChange={(e) => set({ weekday: Number(e.target.value) })}>{DAY_NAMES.map((d, i) => <option key={i} value={i}>{t(d)}</option>)}</select>}
          {plan.every === "month" && <label className="flex items-center gap-1">{t("day")}<input className={`${box} w-20`} inputMode="numeric" value={plan.day} onChange={(e) => set({ day: Number(e.target.value) })} /></label>}
          {plan.every !== "minutes" && <label className="flex items-center gap-1">{plan.every === "hour" ? t("at minute") : t("at")}
            {plan.every !== "hour" && <input className={`${box} w-16`} inputMode="numeric" value={plan.hour} onChange={(e) => set({ hour: Number(e.target.value) })} aria-label={t("hour")} />}
            {plan.every !== "hour" && ":"}<input className={`${box} w-16`} inputMode="numeric" value={plan.minute} onChange={(e) => set({ minute: Number(e.target.value) })} aria-label={t("minute")} /></label>}
        </div>
      </div>
      <p className="text-xs text-fg-2">{t("Everything is worked out in your browser. Nothing is sent anywhere.")}</p>
    </section>
  );
}
