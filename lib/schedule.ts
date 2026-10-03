import type { Tr } from "./i18n";
// Schedules are small strings people can read: "daily@08:00", "weekly@1@09:00" (1 = Monday), "days@12345@09:00" (weekdays), "hourly", "every:6h",
// "monthly@15@10:00" (the 15th of each month), "yearly@02-15@10:00" (every 15 February) — a day the month lacks (31st, 29 Feb) runs on its last day.
export type Schedule = string;

export function validSchedule(s: string): boolean {
  return /^(daily@([01]\d|2[0-3]):[0-5]\d|weekly@[0-6]@([01]\d|2[0-3]):[0-5]\d|days@[0-6]{1,7}@([01]\d|2[0-3]):[0-5]\d|hourly|every:([1-9]|1\d|2[0-4])h|every:\d{1,5}m|once@\d{4}-\d{2}-\d{2}T[\d:.]+Z)$/.test(s) || calendar(s) !== null;
}

/** «monthly@DD@HH:MM» / «yearly@MM-DD@HH:MM» → its parts (mo 0 for monthly), or null. Ported from AI Soul 1d05cf6 (2026-10-01:
 *  a once-a-year filing should be a yearly reminder, not a daily check). */
export function calendar(s: string): { mo: number; d: number; h: number; mi: number; hm: string } | null {
  const m = /^monthly@(\d{2})@(\d{2}):(\d{2})$/.exec(s) ?? /^yearly@(\d{2})-(\d{2})@(\d{2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const y = s.startsWith("yearly@");
  const [mo, d, h, mi] = y ? [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] : [0, Number(m[1]), Number(m[2]), Number(m[3])];
  if ((y && (mo < 1 || mo > 12)) || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  return { mo, d, h, mi, hm: `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}` };
}

/** Offset (minutes) of a time zone at a given instant. */
function tzOffsetMin(tz: string, at: Date): number {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** Wall-clock parts of an instant in a time zone. */
function parts(tz: string, at: Date) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short" });
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday ?? "Sun");
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour), mi: Number(p.minute), dow };
}

/** Instant for a wall-clock time in a zone (two passes handle DST edges). */
function zoned(tz: string, y: number, m: number, d: number, h: number, mi: number): Date {
  const guess = new Date(Date.UTC(y, m - 1, d, h, mi));
  const first = new Date(guess.getTime() - tzOffsetMin(tz, guess) * 60000);
  return new Date(guess.getTime() - tzOffsetMin(tz, first) * 60000);
}

export function nextRun(schedule: Schedule, tz: string, from: Date = new Date()): Date {
  if (schedule === "hourly") return new Date(Math.floor(from.getTime() / 3600000) * 3600000 + 3600000);
  const once = schedule.match(/^once@(.+)$/);
  if (once) { const t = new Date(once[1]!); return t > from ? t : new Date(from.getTime() + 100 * 365 * 86400000); }
  const mins = schedule.match(/^every:(\d+)m$/);
  if (mins) return new Date(from.getTime() + Math.max(1, Number(mins[1])) * 60000);
  const every = schedule.match(/^every:(\d+)h$/);
  if (every) return new Date(from.getTime() + Number(every[1]) * 3600000);
  const cal = calendar(schedule);
  if (cal) {
    const now = parts(tz, from);
    let y = now.y, mo = cal.mo || now.m;
    for (let i = 0; i < 30; i++) {
      const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
      const t = zoned(tz, y, mo, Math.min(cal.d, last), cal.h, cal.mi);
      if (t > from) return t;
      if (cal.mo) y++; else if (++mo > 12) { mo = 1; y++; }
    }
  }
  const daily = schedule.match(/^daily@(\d\d):(\d\d)$/);
  const weekly = schedule.match(/^weekly@(\d)@(\d\d):(\d\d)$/);
  const days = schedule.match(/^days@([0-6]{1,7})@(\d\d):(\d\d)$/);
  const now = parts(tz, from);
  for (let add = 0; add <= 8; add++) {
    const base = new Date(Date.UTC(now.y, now.m - 1, now.d + add));
    const y = base.getUTCFullYear(), m = base.getUTCMonth() + 1, d = base.getUTCDate();
    if (daily) {
      const t = zoned(tz, y, m, d, Number(daily[1]), Number(daily[2]));
      if (t > from) return t;
    } else if (weekly) {
      if (base.getUTCDay() !== Number(weekly[1])) continue;
      const t = zoned(tz, y, m, d, Number(weekly[2]), Number(weekly[3]));
      if (t > from) return t;
    } else if (days) {
      if (!days[1]!.includes(String(base.getUTCDay()))) continue;
      const t = zoned(tz, y, m, d, Number(days[2]), Number(days[3]));
      if (t > from) return t;
    }
  }
  return new Date(from.getTime() + 86400000);
}

/** Date and time in the user's zone, in their language — with the year when it is not this year (AI Soul 9/29: a daily reminder «stops 9/29 19:00» was really 2027). */
export function whenLabel(iso: string, lang: string, tz = "UTC", now = Date.now()): string {
  const d = new Date(iso);
  const year = (x: Date) => x.toLocaleString("en-US", { timeZone: tz, year: "numeric" });
  return d.toLocaleString(lang, { timeZone: tz, ...(year(d) !== year(new Date(now)) ? { year: "numeric" } : {}), month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** «every day at 08:00» in the user's language. Weekday names come from the browser/server's own calendar (Intl). */
export function describeSchedule(s: Schedule, { lang, t }: Tr, tz = "UTC"): string {
  const day = (i: number) => new Date(Date.UTC(2026, 0, 4 + i)).toLocaleDateString(lang, { weekday: "short", timeZone: "UTC" });   // 2026-01-04 is a Sunday
  if (s === "hourly") return t("every hour");
  const o = s.match(/^once@(.+)$/);
  if (o) { const when = whenLabel(o[1]!, lang, tz); return t("once ({when})", { when }); }
  const mm = s.match(/^every:(\d+)m$/);
  if (mm) return t("every {n} min", { n: mm[1]! });
  const e = s.match(/^every:(\d+)h$/);
  if (e) return t("every {n} hours", { n: e[1]! });
  const d = s.match(/^daily@(\d\d:\d\d)$/);
  if (d) return t("every day at {time}", { time: d[1]! });
  const c = calendar(s);
  if (c && !c.mo) return t("every month on day {day} at {time}", { day: String(c.d), time: c.hm });
  if (c) return t("every year on {date} at {time}", { date: new Date(Date.UTC(2024, c.mo - 1, c.d)).toLocaleDateString(lang, { month: "short", day: "numeric", timeZone: "UTC" }), time: c.hm });
  const w = s.match(/^weekly@(\d)@(\d\d:\d\d)$/);
  if (w) return t("every {day} at {time}", { day: day(Number(w[1])), time: w[2]! });
  const ds = s.match(/^days@([0-6]{1,7})@(\d\d:\d\d)$/);
  if (ds) {
    const set = [...new Set(ds[1]!)].sort().join("");
    if (set === "12345") return t("weekdays at {time}", { time: ds[2]! });
    if (set === "06") return t("weekends at {time}", { time: ds[2]! });
    const days = [...set].map((x) => day(Number(x))).join(t(", #daysep"));
    return t("every {days} at {time}", { days, time: ds[2]! });
  }
  return s;
}
