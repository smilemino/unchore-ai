import { asOwner, one, q } from "./db";

// Unchore credit (db/migrations/016_credits.sql · owner «yes» 2026-09-30): Unchore buys AI in advance, members prepay,
// and AI run on Unchore's account takes what it really cost (no markup since 2026-09-30 20:56 — the top-up fee pays, lib/stripe.ts). Every change runs on the owner
// connection — members have no rights on these tables.

export const MICRO = 1_000_000;
const num = (v: string | undefined, d: number) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : d; };
/** Welcome credit for a new member (USD). */
export const welcomeUsd = () => num(process.env.UNCHORE_WELCOME_USD, 2);
/** Only the first this-many members get the welcome credit (owner 2026-09-30 «100명까지») — the house's total gift is bounded. */
export const welcomeMaxMembers = () => num(process.env.UNCHORE_WELCOME_MAX_MEMBERS, 100);
/** How many welcome credits are still left to give. */
export async function welcomeLeft(): Promise<number> {
  const r = await asOwner(() => one<{ n: string }>("select count(*) as n from credit_ledger where kind = 'welcome'"));
  return Math.max(0, welcomeMaxMembers() - Number(r?.n ?? 0));
}
/** Markup on what the AI provider charged us — 0 (owner 2026-09-30 «AI at cost, a fee on top-up» like OpenRouter). */
export const marginRate = () => num(process.env.UNCHORE_CREDIT_MARGIN, 0);
/** Members who never topped up share this much house AI spend per 24 h — the welcome credit can't drain the house account.
 *  The Google voice (note «Google voice», lib/voice/google.ts) has its own daily cap and isn't counted here. */
export const welcomeDayCapUsd = () => num(process.env.UNCHORE_WELCOME_DAY_CAP_USD, 2);

/** Unchore's OpenRouter key: Defend and chat on credit run on it. */
export const houseKey = () => process.env.UNCHORE_HOUSE_OPENROUTER_KEY ?? "";
/** Chat answers on credit — off with UNCHORE_CREDIT_CHAT=off (Defend keeps its own rule). */
export const creditChatOn = () => Boolean(houseKey()) && process.env.UNCHORE_CREDIT_CHAT !== "off";

export type Wallet = { micro: number; paid: boolean };
export type LedgerRow = { delta_micro: number; kind: string; note: string | null; created_at: string };

/** The member's wallet; the first look opens it with the welcome credit (once — the ledger's (member, ref) key),
 *  while the first welcomeMaxMembers() haven't all had theirs. Two signups in the same instant may overshoot by one. */
export function wallet(member: string): Promise<Wallet> {
  return asOwner(async () => {
    const welcome = Math.round(welcomeUsd() * MICRO);
    await q(
      `with g as (select case when (select count(*) from credit_ledger where kind = 'welcome') < $3 then $2::bigint else 0 end as amt),
       w as (insert into credit_wallets(member, micro) select $1, amt from g on conflict (member) do nothing returning member, micro)
       insert into credit_ledger(member, delta_micro, kind, ref, note) select member, micro, 'welcome', 'welcome', 'Welcome credit' from w where micro > 0`,
      [member, welcome, welcomeMaxMembers()],
    );
    const w = await one<{ micro: string; paid: boolean }>("select micro, paid from credit_wallets where member = $1", [member]);
    return { micro: Number(w?.micro ?? 0), paid: Boolean(w?.paid) };
  });
}

export function history(member: string, limit = 20): Promise<LedgerRow[]> {
  return asOwner(async () => (await q<{ delta_micro: string; kind: string; note: string | null; created_at: string }>(
    "select delta_micro, kind, note, created_at from credit_ledger where member = $1 order by id desc limit $2", [member, limit],
  )).map((r) => ({ ...r, delta_micro: Number(r.delta_micro) })));
}

/** May this member start a call on Unchore's account? */
export async function canSpend(member: string): Promise<{ ok: true } | { ok: false; why: "empty" | "day_cap" }> {
  const w = await wallet(member);
  if (w.micro <= 0) return { ok: false, why: "empty" };
  if (w.paid) return { ok: true };
  return (await welcomeUsedTodayMicro()) < welcomeDayCapUsd() * MICRO ? { ok: true } : { ok: false, why: "day_cap" };
}

/** What all welcome-credit members spent on AI in the last day (Google voice left out — it has its own daily minutes). */
export async function welcomeUsedTodayMicro(): Promise<number> {
  const used = await asOwner(() => one<{ m: string }>(
    `select coalesce(-sum(l.delta_micro), 0) as m from credit_ledger l join credit_wallets w on w.member = l.member
     where l.kind = 'use' and l.note is distinct from 'Google voice' and not w.paid and l.created_at > now() - interval '1 day'`,
  ));
  return Number(used?.m ?? 0);
}

/** May this member's chat run on Unchore credit now? Never throws — without it only their own connections answer.
 *  Owner 2026-10-01: a new member's first step is connecting their own Claude, ChatGPT…, and the welcome credit pays for
 *  Unchore's Google voice (lib/voice/google.ts), not for AI answers — chat runs on credit only once they have bought some. */
export async function creditReady(member: string): Promise<boolean> {
  if (!creditChatOn()) return false;
  try {
    if (!(await wallet(member)).paid) return false;
    return (await canSpend(member)).ok;
  } catch { return false; }
}

/** What a call that cost us `costUsd` takes from the member (rounded up to a whole micro-dollar). */
export function priceMicro(costUsd: number): number {
  const cost = Math.round(Math.max(0, costUsd) * MICRO);             // whole micro-dollars first: 0.1 × 1.1 is 0.11000000000000001 in floats
  return Math.max(0, Math.ceil(cost * (1 + marginRate()) - 1e-6));
}

/** Take a finished call's price from the balance (may end slightly below zero — the price is known only afterwards). */
export function charge(member: string, costUsd: number, note: string): Promise<{ charged: number; micro: number }> {
  const charged = priceMicro(costUsd);
  return asOwner(async () => {
    const r = await one<{ micro: string }>(
      `with u as (update credit_wallets set micro = micro - $2, updated_at = now() where member = $1 returning micro)
       insert into credit_ledger(member, delta_micro, kind, cost_micro, note) select $1, -$2::bigint, 'use', $3, $4 from u
       returning (select micro from u)`,
      [member, charged, Math.round(costUsd * MICRO), note.slice(0, 200)],
    );
    return { charged, micro: Number(r?.micro ?? 0) };
  });
}

/** Add paid credit once per `ref` (a Stripe checkout id): a repeated webhook adds nothing. Returns false if already added. */
export async function topUp(member: string, micro: number, ref: string, note: string): Promise<boolean> {
  if (!Number.isInteger(micro) || micro <= 0) throw new Error("bad amount");
  await wallet(member);
  return asOwner(async () => {
    const r = await q(
      `with l as (insert into credit_ledger(member, delta_micro, kind, ref, note) values ($1, $2, 'topup', $3, $4) on conflict do nothing returning delta_micro)
       update credit_wallets set micro = micro + (select delta_micro from l), paid = true, updated_at = now()
       where member = $1 and exists (select 1 from l) returning micro`,
      [member, micro, ref, note.slice(0, 200)],
    );
    return r.length > 0;
  });
}

export const usd = (micro: number) => (micro / MICRO).toFixed(2);
