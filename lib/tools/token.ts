import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// A short-lived, signed «turn ticket» for tool calls that come back from the Claude-plan worker (worker/mcp.mjs → /api/tools/call).
// It says which member, which chat, and whether their latest message was a «yes» — the worker can't change any of it.
export type TurnTicket = { u: string; c: string; l: string; y: boolean; exp: number };

function key(): Buffer {
  const raw = process.env.UNCHORE_SECRET_KEY ?? "";
  if (!raw) throw new Error("UNCHORE_SECRET_KEY is not set");
  return createHash("sha256").update(`unchore-tool-ticket:${raw}`).digest();
}

export function makeTicket(t: Omit<TurnTicket, "exp">, ttlMs = 15 * 60_000): string {
  const body = Buffer.from(JSON.stringify({ ...t, exp: Date.now() + ttlMs })).toString("base64url");
  return `${body}.${createHmac("sha256", key()).update(body).digest("base64url")}`;
}

export function readTicket(s: string): TurnTicket | null {
  const [body, sig] = String(s).split(".");
  if (!body || !sig) return null;
  const want = createHmac("sha256", key()).update(body).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const t = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TurnTicket;
    return typeof t.exp === "number" && t.exp > Date.now() ? t : null;
  } catch { return null; }
}
