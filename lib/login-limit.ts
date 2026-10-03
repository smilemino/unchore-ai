// How often sign-in e-mails can be asked for (AI Soul lib/server/login-limit.ts, made general): one link a minute from the same
// place to the same address, a few addresses an hour from one place, and a ceiling for the whole site so nobody can use us to
// flood inboxes. The per-address limit (5 an hour) stays in app/api/auth/email/route.ts. The internet address is kept only as a hash.
import { sha256 } from "@/lib/crypto";
import { one } from "@/lib/db";

export const LIMITS = { sameSec: 60, perPlaceHour: 10, allPerMin: 60, allPerHour: 1000 } as const;

export function clientIp(h: Headers): string {
  return (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "").split(",")[0]!.trim().slice(0, 45) || "?";
}
export function placeKey(ip: string): string { return `ip:${sha256(`login|${ip}`).slice(0, 16)}`; }

export type Counts = { same: number; place: number; perMin: number; perHour: number };
export type Refusal = "wait" | "too_many" | "busy";

/** Why this ask is refused, or null to send. */
export function refuse(c: Counts): Refusal | null {
  if (c.same > 0) return "wait";
  if (c.place >= LIMITS.perPlaceHour) return "too_many";
  if (c.perMin >= LIMITS.allPerMin || c.perHour >= LIMITS.allPerHour) return "busy";
  return null;
}

export async function countAsks(key: string, email: string): Promise<Counts> {
  const r = await one<Partial<Counts>>(`select
      count(*) filter (where requested_from = $1 and email = $2 and created_at > now() - make_interval(secs => $3))::int as same,
      count(*) filter (where requested_from = $1)::int as place,
      count(*) filter (where created_at > now() - interval '1 minute')::int as "perMin",
      count(*)::int as "perHour"
    from login_tokens where created_at > now() - interval '1 hour' and requested_from is not null`, [key, email, LIMITS.sameSec]);
  return { same: r?.same ?? 0, place: r?.place ?? 0, perMin: r?.perMin ?? 0, perHour: r?.perHour ?? 0 };
}
