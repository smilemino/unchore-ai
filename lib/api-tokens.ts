import { createHash, randomBytes } from "node:crypto";
import { asOwner, one, q } from "./db";

// Personal access tokens for tools outside the app (first: the «unchore-defend» skill in Claude Code / Codex).
// The token is shown once; only its sha256 is stored (db/migrations/016_credits.sql, system-only table).

const MAX = 5;
const hash = (t: string) => createHash("sha256").update(t).digest("hex");

export type TokenRow = { id: string; hint: string; label: string | null; created_at: string; last_used_at: string | null };

export function listTokens(member: string): Promise<TokenRow[]> {
  return asOwner(() => q<TokenRow>(
    "select id, hint, label, created_at, last_used_at from api_tokens where member = $1 and revoked_at is null order by created_at desc", [member],
  ));
}

/** A new token (plain text — shown once). null when the member already has the maximum. */
export function createToken(member: string, label: string | null): Promise<{ token: string; row: TokenRow } | null> {
  return asOwner(async () => {
    const n = await one<{ n: number }>("select count(*)::int as n from api_tokens where member = $1 and revoked_at is null", [member]);
    if ((n?.n ?? 0) >= MAX) return null;
    const token = `unc_${randomBytes(24).toString("base64url")}`;
    const row = await one<TokenRow>(
      "insert into api_tokens(member, hash, hint, label) values ($1, $2, $3, $4) returning id, hint, label, created_at, last_used_at",
      [member, hash(token), `unc_…${token.slice(-4)}`, label?.slice(0, 60) || null],
    );
    return { token, row: row! };
  });
}

export function revokeToken(member: string, id: string): Promise<boolean> {
  return asOwner(async () => (await q("update api_tokens set revoked_at = now() where member = $1 and id = $2 and revoked_at is null returning id", [member, id])).length > 0);
}

/** The member a «Bearer unc_…» header belongs to, or null. */
export function memberFromToken(authorization: string | null): Promise<string | null> {
  const m = /^Bearer\s+(unc_[A-Za-z0-9_-]{20,})\s*$/.exec(authorization ?? "");
  if (!m) return Promise.resolve(null);
  return asOwner(async () => (await one<{ member: string }>(
    "update api_tokens set last_used_at = now() where hash = $1 and revoked_at is null returning member", [hash(m[1]!)],
  ))?.member ?? null);
}
