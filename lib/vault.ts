import { open } from "./crypto";
import { one } from "./db";

/** One saved secret of this member (Settings → saved logins, or the chat's 🔐 field), decrypted — for recipes only, never for the AI. */
export async function vaultSecret(userId: string, name: string): Promise<string | null> {
  const r = await one<{ enc: string }>("select enc from vault where user_id = $1 and name = $2", [userId, name]).catch(() => null);
  if (!r) return null;
  try { return open(r.enc); } catch { return null; }
}

/** Which of these names the member has saved (no values). */
export async function hasSecrets(userId: string, names: string[]): Promise<string[]> {
  const r = await one<{ names: string[] | null }>("select array_agg(name) as names from vault where user_id = $1 and name = any($2)", [userId, names]).catch(() => null);
  return r?.names ?? [];
}
