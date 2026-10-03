// Free tool «cron ↔ plain words» (benchmark 2026-10-01, low-involvement tools): read a 5-field cron line, say it in words,
// build one from plain choices, and list the next runs. Pure functions — the page runs them in the browser.
import { k, type TFn } from "../i18n";

export type Field = { any: boolean; values: number[]; step?: number };
export type Cron = { minute: Field; hour: Field; dom: Field; month: Field; dow: Field };

const RANGES: [number, number][] = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]];
const NAMES: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12, sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const MACROS: Record<string, string> = { "@yearly": "0 0 1 1 *", "@annually": "0 0 1 1 *", "@monthly": "0 0 1 * *", "@weekly": "0 0 * * 0", "@daily": "0 0 * * *", "@midnight": "0 0 * * *", "@hourly": "0 * * * *" };

function num(s: string, i: number): number {
  const v = NAMES[s.toLowerCase()] ?? (/^\d+$/.test(s) ? Number(s) : NaN);
  const n = i === 4 && v === 7 ? 0 : v;   // 7 = Sunday too
  if (!Number.isInteger(n) || n < RANGES[i]![0] || n > RANGES[i]![1]) throw new Error(`bad value «${s}»`);
  return n;
}

function field(s: string, i: number): Field {
  const [lo, hi] = RANGES[i]!;
  if (s === "*" || s === "?") return { any: true, values: range(lo, hi, 1) };
  const out = new Set<number>();
  let step: number | undefined;
  for (const part of s.split(",")) {
    const m = /^(\*|[\w]+)(?:-([\w]+))?(?:\/(\d+))?$/.exec(part);
    if (!m) throw new Error(`bad part «${part}»`);
    const st = m[3] ? Number(m[3]) : 1;
    if (st < 1) throw new Error(`bad step «${part}»`);
    const a = m[1] === "*" ? lo : num(m[1]!, i);
    const b = m[2] ? num(m[2], i) : m[1] === "*" || m[3] ? hi : a;
    if (b < a) throw new Error(`bad range «${part}»`);
    for (const v of range(a, b, st)) out.add(v);
    if (m[3] && s.split(",").length === 1 && m[1] === "*") step = st;
  }
  return { any: false, values: [...out].sort((x, y) => x - y), step };
}

const range = (a: number, b: number, s: number) => { const r: number[] = []; for (let v = a; v <= b; v += s) r.push(v); return r; };

/** Parse «m h dom mon dow» (or @daily …). Throws with a short reason. */
export function parseCron(expr: string): Cron {
  const e = MACROS[expr.trim().toLowerCase()] ?? expr.trim();
  const p = e.split(/\s+/);
  if (p.length !== 5) throw new Error("a cron line has 5 parts: minute hour day-of-month month day-of-week");
  const [minute, hour, dom, month, dow] = p.map((s, i) => field(s, i)) as [Field, Field, Field, Field, Field];
  return { minute, hour, dom, month, dow };
}

const pad = (n: number) => String(n).padStart(2, "0");
export const DAY_NAMES = [k("Sunday"), k("Monday"), k("Tuesday"), k("Wednesday"), k("Thursday"), k("Friday"), k("Saturday")];
export const MONTH_NAMES = [k("January"), k("February"), k("March"), k("April"), k("May"), k("June"), k("July"), k("August"), k("September"), k("October"), k("November"), k("December")];

/** The cron line in plain words (in the page's language). */
export function describeCron(expr: string, t: TFn): string {
  const c = parseCron(expr);
  const times = c.hour.values.length * c.minute.values.length;
  let when: string;
  if (c.minute.any && c.hour.any) when = t("Every minute");
  else if (c.minute.step && c.hour.any) when = t("Every {n} minutes", { n: c.minute.step });
  else if (c.hour.any && c.minute.values.length === 1) when = t("Every hour at minute {m}", { m: c.minute.values[0]! });
  else if (c.hour.step && c.minute.values.length === 1) when = t("Every {n} hours at minute {m}", { n: c.hour.step, m: c.minute.values[0]! });
  else if (times <= 6) when = t("At {times}", { times: c.hour.values.flatMap((h) => c.minute.values.map((m) => `${pad(h)}:${pad(m)}`)).join(", ") });
  else when = t("At minutes {m} of hours {h}", { m: c.minute.values.join(", "), h: c.hour.values.join(", ") });
  const days: string[] = [];
  if (!c.dow.any) {
    const d = c.dow.values;
    days.push(d.join() === "1,2,3,4,5" ? t("on weekdays (Monday to Friday)") : d.join() === "0,6" ? t("on weekends") : t("on {days}", { days: d.map((x) => t(DAY_NAMES[x]!)).join(", ") }));
  }
  if (!c.dom.any) days.push(t("on day {d} of the month", { d: c.dom.values.join(", ") }));
  if (!c.month.any) days.push(t("in {months}", { months: c.month.values.map((x) => t(MONTH_NAMES[x - 1]!)).join(", ") }));
  if (!days.length && !(c.hour.any || c.hour.step)) days.push(t("every day"));
  return [when, ...days].join(" · ");
}

export type Plan = { every: "minutes" | "hour" | "day" | "weekdays" | "week" | "month"; n?: number; hour?: number; minute?: number; day?: number; weekday?: number };
/** Plain choices → a cron line. */
export function buildCron(p: Plan): string {
  const h = Math.min(23, Math.max(0, p.hour ?? 9)), m = Math.min(59, Math.max(0, p.minute ?? 0));
  switch (p.every) {
    case "minutes": return `*/${Math.min(59, Math.max(1, p.n ?? 15))} * * * *`;
    case "hour": return `${m} * * * *`;
    case "day": return `${m} ${h} * * *`;
    case "weekdays": return `${m} ${h} * * 1-5`;
    case "week": return `${m} ${h} * * ${Math.min(6, Math.max(0, p.weekday ?? 1))}`;
    case "month": return `${m} ${h} ${Math.min(31, Math.max(1, p.day ?? 1))} * *`;
  }
}

/** The next runs after «from», in the time zone the Date methods use (the visitor's own in the browser). */
export function nextRuns(expr: string, n: number, from: Date = new Date()): Date[] {
  const c = parseCron(expr);
  const out: Date[] = [];
  const d = new Date(from.getTime());
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1);
  const has = (f: Field, v: number) => f.values.includes(v);
  // Standard cron: when both day fields are limited, either may match.
  const dayOk = (x: Date) => c.dom.any && c.dow.any ? true : c.dom.any ? has(c.dow, x.getDay()) : c.dow.any ? has(c.dom, x.getDate()) : has(c.dom, x.getDate()) || has(c.dow, x.getDay());
  for (let i = 0; i < 600_000 && out.length < n; i++) {
    if (!has(c.month, d.getMonth() + 1) || !dayOk(d)) { d.setDate(d.getDate() + 1); d.setHours(0, 0, 0, 0); continue; }
    if (!has(c.hour, d.getHours())) { d.setHours(d.getHours() + 1, 0, 0, 0); continue; }
    if (has(c.minute, d.getMinutes())) out.push(new Date(d.getTime()));
    d.setMinutes(d.getMinutes() + 1);
  }
  return out;
}
