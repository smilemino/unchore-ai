import { googleClientId, googleClientSecret } from "./google-env";
import { one, q } from "./db";
import { lock, unlock } from "./privacy";

// The member's own Google account (ported from AI Soul «커넥터», which borrows claude.ai's; Unchore has its own Google sign-in, so it
// asks Google directly). Only the services they switch on are asked for; tokens are stored locked and refreshed quietly.
// Uses the sign-in callback (/api/auth/google/callback, state «c:…») so no second address has to be registered with Google.
export const GOOGLE_SCOPES = {
  calendar: ["https://www.googleapis.com/auth/calendar.events"],
  // Only «sensitive»/«non-sensitive» scopes, so Google's ordinary review is enough — no yearly CASA security audit (owner 2026-10-01).
  // Reading the whole inbox (gmail.readonly) and every Drive file (drive.readonly) are «restricted»; left out on purpose.
  gmail: ["https://www.googleapis.com/auth/gmail.send"],
  drive: ["https://www.googleapis.com/auth/drive.file"],   // only the files the member picks in Google's own picker (components/DrivePick.tsx)
} as const;
export type Service = keyof typeof GOOGLE_SCOPES;
export const SERVICES = Object.keys(GOOGLE_SCOPES) as Service[];

export const isService = (s: string): s is Service => (SERVICES as string[]).includes(s);
/** Which services a granted scope list covers (all of a service's scopes must be there). */
export function servicesOf(scopes: string): Service[] {
  const have = new Set(scopes.split(/\s+/));
  return SERVICES.filter((s) => GOOGLE_SCOPES[s].every((x) => have.has(x)));
}

export function connectUrl(redirect: string, services: Service[], state: string, challenge: string, email?: string | null): string {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", googleClientId());
  u.searchParams.set("redirect_uri", redirect);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", ["openid", "email", ...services.flatMap((s) => GOOGLE_SCOPES[s])].join(" "));
  u.searchParams.set("access_type", "offline");
  // No «include_granted_scopes»: an older grant (with the restricted scopes) must not ride along on the new token.
  u.searchParams.set("prompt", "consent");   // a refresh token every time, so a re-connect always works
  u.searchParams.set("state", state);
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  if (email) u.searchParams.set("login_hint", email);
  return u.toString();
}

type Tok = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; id_token?: string };

export async function exchangeCode(code: string, verifier: string, redirect: string): Promise<Tok | null> {
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, code_verifier: verifier, grant_type: "authorization_code", client_id: googleClientId(), client_secret: googleClientSecret(), redirect_uri: redirect }) }).catch(() => null);
  return r?.ok ? ((await r.json()) as Tok) : null;
}

export async function saveConnection(userId: string, t: Tok): Promise<Service[]> {
  const email = t.id_token ? (JSON.parse(Buffer.from(t.id_token.split(".")[1] ?? "", "base64url").toString("utf8")) as { email?: string }).email ?? null : null;
  await q(`insert into connections(user_id, provider, email, scopes, refresh, access, expires_at) values ($1, 'google', $2, $3, $4, $5, now() + ($6 || ' seconds')::interval)
      on conflict (user_id, provider) do update set email = coalesce(excluded.email, connections.email), scopes = excluded.scopes,
        refresh = coalesce(excluded.refresh, connections.refresh), access = excluded.access, expires_at = excluded.expires_at, updated_at = now()`,
    [userId, email, t.scope ?? "", t.refresh_token ? lock(t.refresh_token) : null, t.access_token ? lock(t.access_token) : null, String(Math.max(60, (t.expires_in ?? 3600) - 60))]);
  return servicesOf(t.scope ?? "");
}

export async function connection(userId: string): Promise<{ email: string | null; services: Service[] } | null> {
  const r = await one<{ email: string | null; scopes: string }>("select email, scopes from connections where user_id = $1 and provider = 'google'", [userId]);
  return r ? { email: r.email, services: servicesOf(r.scopes) } : null;
}

/** A live access token — refreshed when it is about to end. null when not connected or Google took the access back. */
export async function accessToken(userId: string): Promise<string | null> {
  const r = await one<{ refresh: string | null; access: string | null; fresh: boolean }>("select refresh, access, expires_at > now() as fresh from connections where user_id = $1 and provider = 'google'", [userId]);
  if (!r) return null;
  if (r.fresh && r.access) return unlock(r.access);
  if (!r.refresh) return null;
  const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: unlock(r.refresh), client_id: googleClientId(), client_secret: googleClientSecret() }) }).catch(() => null);
  if (!res?.ok) {
    if (res && res.status === 400) await q("update connections set access = null, refresh = null where user_id = $1 and provider = 'google'", [userId]);   // revoked → the screen asks to connect again
    return null;
  }
  const t = (await res.json()) as Tok;
  await q("update connections set access = $2, expires_at = now() + ($3 || ' seconds')::interval, scopes = coalesce($4, scopes), updated_at = now() where user_id = $1 and provider = 'google'",
    [userId, lock(t.access_token ?? ""), String(Math.max(60, (t.expires_in ?? 3600) - 60)), t.scope ?? null]);
  return t.access_token ?? null;
}

export async function disconnect(userId: string): Promise<void> {
  const r = await one<{ refresh: string | null }>("select refresh from connections where user_id = $1 and provider = 'google'", [userId]);
  if (r?.refresh) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(unlock(r.refresh))}`, { method: "POST" }).catch(() => null);
  await q("delete from connections where user_id = $1 and provider = 'google'", [userId]);
}
