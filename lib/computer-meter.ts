import { MICRO, charge, wallet } from "./credits";
import { asOwner, one, q } from "./db";

// Machine time for the cloud computer and the browser (owner 2026-10-03 00:59): every member gets FREE_MIN minutes a month on
// Unchore; after that it comes out of credit they bought, at cost. All members' free minutes together are capped each month at
// ₩100,000 (FREE_MONTH_KRW); when the pool reaches it the free part stops and AI Soul asks the owner whether to add more for
// that month (reminder-gates/unchore-computer-cap → house_settings «computer_free_extra_krw:<YYYY-MM>», 039). Owners aren't metered.
// Kept in credit_ledger as «use» rows: the free part with delta 0 (what it cost us is in cost_micro), the paid part through charge().
// (First drafted by AI Soul chat deaa, d869266 — 30 free minutes, then bought credit.)

export const NOTE = "Cloud computer";
const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : d);
/** Free minutes per member per calendar month (UTC). */
export const freeMinutes = () => num(process.env.UNCHORE_COMPUTER_FREE_MIN, 30);
/** What one minute costs us: 2 vCPUs + 4 GB on Vercel Sandbox, CPU counted as busy (Pro, iad1, 2026-09) — on the safe side. */
export const usdPerMinute = () => num(process.env.UNCHORE_COMPUTER_USD_PER_MIN, 0.006);
/** All members' free minutes together, per month, in won (owner: ₩100,000, then ask). */
export const freeMonthKrw = () => num(process.env.UNCHORE_COMPUTER_FREE_MONTH_KRW, 100_000);
/** Won per dollar for the pool (KB Kookmin Bank base rate 2026-10-02: 1,365.60). */
export const krwPerUsd = () => num(process.env.UNCHORE_KRW_PER_USD, 1365.6) || 1365.6;
export const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);

/** This month's pool: won the owner allowed (base + what they added after being asked) and what the free part has cost so far. */
export async function pool(): Promise<{ capKrw: number; usedKrw: number; full: boolean }> {
  const r = await asOwner(() => one<{ used: string; extra: string | null }>(
    `select (select coalesce(sum(cost_micro), 0) from credit_ledger where kind = 'use' and delta_micro = 0 and note = $1 and created_at >= date_trunc('month', now())) as used,
            (select value from house_settings where key = $2) as extra`,
    [`${NOTE} (free)`, `computer_free_extra_krw:${monthKey()}`],
  ));
  const capKrw = freeMonthKrw() + num(r?.extra ?? undefined, 0);
  const usedKrw = (Number(r?.used ?? 0) / MICRO) * krwPerUsd();
  return { capKrw, usedKrw, full: usedKrw >= capKrw };
}

export type Allowance = { ok: true; free: number } | { ok: false; why: "used_up" };

/** Free minutes left this month for this member (0 when the monthly pool for everyone is spent). */
export async function freeLeft(member: string): Promise<number> {
  if ((await pool()).full) return 0;
  const r = await asOwner(() => one<{ mine: string }>(
    `select coalesce(sum(cost_micro), 0) as mine from credit_ledger
     where member = $1 and kind = 'use' and delta_micro = 0 and note = $2 and created_at >= date_trunc('month', now())`,
    [member, `${NOTE} (free)`],
  ));
  const rate = usdPerMinute() * MICRO;
  return rate > 0 ? Math.max(0, freeMinutes() - Number(r?.mine ?? 0) / rate) : freeMinutes();
}

/** May this member use machine time now? Free minutes first, then credit they bought. */
export async function allowance(member: string): Promise<Allowance> {
  const free = await freeLeft(member);
  if (free > 0) return { ok: true, free };
  const w = await wallet(member);
  return w.paid && w.micro > 0 ? { ok: true, free: 0 } : { ok: false, why: "used_up" };
}

/** Write down `minutes` of machine time: the free part first, the rest from the balance. Returns what was charged (micro-dollars). */
export async function record(member: string, minutes: number): Promise<{ free: number; paid: number; charged: number }> {
  if (!(minutes > 0)) return { free: 0, paid: 0, charged: 0 };
  const free = Math.min(minutes, await freeLeft(member));
  const paid = minutes - free;
  if (free > 0) {
    await asOwner(() => q(
      "insert into credit_ledger(member, delta_micro, kind, cost_micro, note) values ($1, 0, 'use', $2, $3)",
      [member, Math.round(free * usdPerMinute() * MICRO), `${NOTE} (free)`],
    ));
  }
  if (paid > 0) await wallet(member);   // a member whose first call runs past the free minutes gets a wallet to take it from
  const charged = paid > 0 ? (await charge(member, paid * usdPerMinute(), NOTE)).charged : 0;
  return { free, paid, charged };
}

/** Minutes a tool call counts for: the time it took, at least a quarter minute, plus a block for work left running in the background. */
export const minutesFor = (ms: number, background = false) => Math.max(ms / 60_000, 0.25) + (background ? 10 : 0);

/** What the AI tells the member when the free minutes are used up and there's no credit. */
export const USED_UP = (base: string) =>
  `The member's free computer time for this month is used up and they have no Unchore credit. Tell them in plain words: they can top up credit (${base}/app/settings?tab=ai#credits) — machine time is then taken at cost — or connect their own computer for free in Settings → Your computers. Don't try the tool again in this answer.`;
