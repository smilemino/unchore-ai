// Free tool «what a chore costs you» (benchmark 2026-10-01): minutes × how often → hours and money a year.
export type Per = "day" | "workday" | "week" | "month";
const PER_YEAR: Record<Per, number> = { day: 365, workday: 250, week: 52, month: 12 };

export function choreCost(p: { minutes: number; times: number; per: Per; hourly?: number }): { hoursYear: number; daysYear: number; moneyYear: number | null; hours5y: number } {
  const minutes = Math.max(0, Number(p.minutes) || 0), times = Math.max(0, Number(p.times) || 0);
  const hoursYear = (minutes * times * PER_YEAR[p.per]) / 60;
  const hourly = Number(p.hourly);
  return {
    hoursYear: Math.round(hoursYear * 10) / 10,
    daysYear: Math.round((hoursYear / 8) * 10) / 10,   // 8-hour working days
    moneyYear: Number.isFinite(hourly) && hourly > 0 ? Math.round(hoursYear * hourly) : null,
    hours5y: Math.round(hoursYear * 5),
  };
}
