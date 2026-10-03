import { AsyncLocalStorage } from "node:async_hooks";
import pg from "pg";

// One small pool per server instance. Serverless-friendly: few connections, short idle time.
const g = globalThis as unknown as { __ucPool?: pg.Pool; __ucWho?: AsyncLocalStorage<{ uid: string }> };

function pool(): pg.Pool {
  if (!g.__ucPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const local = /localhost|127\.0\.0\.1|\/tmp/.test(url);
    g.__ucPool = new pg.Pool({ connectionString: url, max: 3, idleTimeoutMillis: 10_000, ssl: local ? false : { rejectUnauthorized: false } });
  }
  return g.__ucPool;
}

// Member lock (db/migrations/005_member_lock.sql): once a request knows its member, every query runs as the
// fenced role «unchore_member» with app.user_id = that member, so Postgres itself hides other members' rows.
// No member known (sign-in, cron, system work) → the owner connection, as before.
const who = (g.__ucWho ??= new AsyncLocalStorage<{ uid: string }>());
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** From here on, this request's queries only see `uid`'s rows. Called by isResp() in lib/api.ts. */
export function actAs(uid: string): void {
  if (!UUID.test(uid)) throw new Error("bad member id");
  who.enterWith({ uid });
}

/** Run `fn` fenced to one member (for work that is not an API request, e.g. a scheduled run). */
export function asMember<T>(uid: string, fn: () => Promise<T>): Promise<T> {
  if (!UUID.test(uid)) throw new Error("bad member id");
  return who.run({ uid }, fn);
}

/** Run `fn` on the owner connection even inside a member's request — only for system-only tables
 *  (credit_wallets, credit_ledger, api_tokens; see lib/credits.ts), which members can never touch themselves. */
export function asOwner<T>(fn: () => Promise<T>): Promise<T> {
  return who.run({ uid: "" }, fn);
}

export function actingMember(): string | null {
  return who.getStore()?.uid ?? null;
}

export function hasDb(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

type Tagged = pg.PoolClient & { __ucAs?: string };

export async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const uid = who.getStore()?.uid ?? "";
  const c = (await pool().connect()) as Tagged;
  let broken = false;
  try {
    if (c.__ucAs !== uid) {
      c.__ucAs = undefined;
      await c.query("select set_config('role', $1, false), set_config('app.user_id', $2, false)", [uid ? "unchore_member" : "none", uid]);
      c.__ucAs = uid;
    }
    const r = await c.query(sql, params);
    return r.rows as T[];
  } catch (e) {
    broken = c.__ucAs === undefined; // never hand back a connection whose role we are unsure of
    throw e;
  } finally {
    c.release(broken || undefined);
  }
}

export async function one<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await q<T>(sql, params);
  return rows[0] ?? null;
}
