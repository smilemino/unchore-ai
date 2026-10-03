import { cookies, headers } from "next/headers";
import { deviceLabel } from "./device-label";
import { hasDb, one, q } from "./db";
import { sha256, token } from "./crypto";
import { signupTz } from "./tz";
import { SOURCE_COOKIE, applySource } from "./growth-source";

export const SESSION_COOKIE = "uc_s";
const DAYS = 30;

export type User = {
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
  lang: string;
  tz: string;
  default_model: string | null;
  notify_email: boolean;
  instructions?: string;
  memory_on?: boolean;
  memory_write?: boolean;
  web_search?: boolean;
  claude_connectors?: boolean;
  improve?: boolean;
  ask_judge?: boolean;
  keep_going?: boolean;
  plain_gate?: boolean;
  face?: string | null;
  nudge_level?: number;
  nudge_at?: string;
  theme?: string;
};

// The database keeps only a hash of each sign-in, never the cookie itself — a leaked table or backup can't sign anyone in.
// Sign-ins made before this kept the raw cookie (43 characters, never 64 like a hash); they still work and switch to the hash on first use.
// A raw match is only taken when the row is not a hash, so a hash read off a leaked table is not itself a cookie.
export const sessionKey = (raw: string) => sha256(raw);
const MATCH = "(s.id = $1 or (s.id = $2 and length(s.id) <> 64))";
const upgrade = (key: string, raw: string) => q("update sessions set id = $1 where id = $2 and length(id) <> 64", [key, raw]).catch(() => { /* the next request tries again */ });

/** The live sign-in behind a cookie, as its database key (hash), or null. */
export async function liveSessionKey(raw: string | undefined): Promise<string | null> {
  if (!raw) return null;
  const key = sessionKey(raw);
  const row = await one<{ id: string }>(`select s.id from sessions s where ${MATCH} and s.expires_at > now() order by (s.id = $1) desc limit 1`, [key, raw]);
  if (!row) return null;
  if (row.id !== key) await upgrade(key, raw);
  return key;
}

/** Makes a sign-in. Returns the cookie value; the database gets only its hash. */
export async function createSession(userId: string): Promise<string> {
  const raw = token(32);
  let ua = "";
  try { ua = (await headers()).get("user-agent") ?? ""; } catch { /* not inside a request (tests, scripts) */ }
  await q("insert into sessions(id, user_id, expires_at, device, last_seen_at) values ($1, $2, now() + ($3 || ' days')::interval, $4, now())", [sessionKey(raw), userId, String(DAYS), deviceLabel(ua) || null]);
  await q("update users set last_login_at = now() where id = $1", [userId]);
  return raw;
}

export function sessionCookie(id: string) {
  return { name: SESSION_COOKIE, value: id, httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: DAYS * 86400 };
}

export async function currentUser(): Promise<User | null> {
  if (!hasDb()) return null;
  const jar = await cookies();
  const sid = jar.get(SESSION_COOKIE)?.value;
  if (!sid) return null;
  const key = sessionKey(sid);
  const row = await one<User & { sid: string }>(
    `select s.id as sid, u.id, u.email, u.name, u.avatar, u.lang, u.tz, u.default_model, u.notify_email, u.instructions, u.memory_on, u.memory_write, u.web_search, u.claude_connectors, u.improve, u.ask_judge, u.keep_going, u.plain_gate, u.theme, u.face, u.nudge_level, u.nudge_at from sessions s join users u on u.id = s.user_id where ${MATCH} and s.expires_at > now() order by (s.id = $1) desc limit 1`,
    [key, sid],
  );
  if (!row) return null;
  const { sid: found, ...user } = row;
  if (found !== key) await upgrade(key, sid);
  return user;
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const sid = jar.get(SESSION_COOKIE)?.value;
  if (sid) await q(`delete from sessions s where ${MATCH}`, [sessionKey(sid), sid]);
}

export async function upsertUser(email: string, fields: { name?: string | null; avatar?: string | null; googleSub?: string | null; lang?: string; tz?: string | null }): Promise<string> {
  const row = await one<{ id: string; inserted: boolean }>(
    `insert into users(email, name, avatar, google_sub, lang, tz) values (lower($1), $2, $3, $4, coalesce($5, 'en'), $6)
     on conflict (email) do update set name = coalesce(users.name, excluded.name), avatar = coalesce(excluded.avatar, users.avatar),
       google_sub = coalesce(users.google_sub, excluded.google_sub)
     returning id, (xmax = 0) as inserted`,
    [email, fields.name ?? null, fields.avatar ?? null, fields.googleSub ?? null, fields.lang ?? null, signupTz(fields.tz, fields.lang)],   // tz only for new accounts — on conflict it is left as the user set it
  );
  if (!row) throw new Error("user upsert failed");
  if (row.inserted) {   // a new account: remember where it came from (growth wheel — lib/growth-source.ts)
    let raw: string | undefined;
    try { raw = (await cookies()).get(SOURCE_COOKIE)?.value; } catch { /* not inside a request (tests, scripts) */ }
    await applySource(row.id, raw).catch(() => { /* never block a sign-in over this */ });
  }
  return row.id;
}
