import { q } from "./db";
import { lock } from "./privacy";

// Owner only: Unchore's own YouTube channel, so the growth loop can post Shorts (owner «1순위» 2026-10-02).
// Not a member service — no screen, no translations. Stored as connections row provider «youtube» (tokens locked).
export const YT_SCOPE = "https://www.googleapis.com/auth/youtube.upload";
export const isOwnerEmail = (e: string | null | undefined) =>
  !!e && (process.env.OWNER_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).includes(e.toLowerCase());

type Tok = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string };
export async function saveYoutube(userId: string, t: Tok): Promise<boolean> {
  if (!t.refresh_token || !(t.scope ?? "").split(/\s+/).includes(YT_SCOPE)) return false;
  await q(`insert into connections(user_id, provider, scopes, refresh, access, expires_at) values ($1, 'youtube', $2, $3, $4, now() + ($5 || ' seconds')::interval)
      on conflict (user_id, provider) do update set scopes = excluded.scopes, refresh = excluded.refresh, access = excluded.access, expires_at = excluded.expires_at, updated_at = now()`,
    [userId, t.scope ?? "", lock(t.refresh_token), t.access_token ? lock(t.access_token) : null, String(Math.max(60, (t.expires_in ?? 3600) - 60))]);
  return true;
}
