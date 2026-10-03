// «Alerts in» (ported from AI Soul's inbox address, 2026-10-02 sync): the member makes an address with its own key; their own
// outside service (a shop, a server, an automation tool like Zapier or n8n) POSTs to it and the message lands in the chat the
// member picked, as a 🔔 note. No AI runs on it (nothing billed); the member reads it and asks about it if they want.
// The key is shown once (only its sha256 is kept, inbox_hooks 045); a new key stops the old one at once; a turned-off address
// refuses everything; each address takes at most `per_hour` messages an hour. Card and ID numbers are masked before saving.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { asMember, asOwner, one, q } from "./db";
import { lock, unlock } from "./privacy";
import { maskPrivate } from "./msg-intake";

export const HOOKS_MAX = 10, NAME_MAX = 60, TEXT_MAX = 8000, BODY_MAX = 64_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hash = (k: string) => createHash("sha256").update(k).digest("hex");
const newKey = () => `uci_${randomBytes(24).toString("base64url")}`;

export const cleanName = (s: string) => s.replace(/[\u0000-\u001f«»]/g, " ").replace(/\s+/g, " ").trim().slice(0, NAME_MAX);

/** The message's words from what the service sent: JSON {text|message|content, title?} or any JSON (shown as code), or plain text. */
export function incomingText(raw: string, contentType: string | null): string | null {
  const s = raw.replace(/\u0000/g, "").trim();
  if (!s) return null;
  let v: unknown = undefined;
  if (/json/i.test(contentType ?? "") || /^[{["]/.test(s)) { try { v = JSON.parse(s); } catch { v = undefined; } }
  let out: string;
  if (v === undefined) out = s;
  else if (typeof v === "string") out = v.trim();
  else if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    const body = [o.text, o.message, o.content, o.body].find((x) => typeof x === "string" && x.trim()) as string | undefined;
    const title = typeof o.title === "string" && o.title.trim() ? o.title.trim().slice(0, 200) : "";
    out = body ? (title ? `**${title}**\n\n${body.trim()}` : body.trim()) : `${title ? `**${title}**\n\n` : ""}\`\`\`json\n${JSON.stringify(v, null, 2).slice(0, TEXT_MAX)}\n\`\`\``;
  } else out = `\`\`\`json\n${JSON.stringify(v, null, 2).slice(0, TEXT_MAX)}\n\`\`\``;
  out = maskPrivate(out).slice(0, TEXT_MAX);
  return out.trim() ? out : null;
}

/** The note as it shows in the chat — marked as coming from outside, so it is never read as the member's or the AI's own words. */
export const alertNote = (name: string, text: string) => `🔔 «${cleanName(name)}»\n\n${text}`;

export type HookRow = { id: string; name: string; hint: string; conversation_id: string | null; enabled: boolean; per_hour: number; last_at: string | null; created_at: string };
type Raw = HookRow & { user_id: string; key_hash: string };
const view = (r: Raw): HookRow => ({ id: r.id, name: unlock(r.name), hint: r.hint, conversation_id: r.conversation_id, enabled: r.enabled, per_hour: r.per_hour, last_at: r.last_at, created_at: r.created_at });
export const hookUrl = (base: string, id: string, key?: string) => `${base.replace(/\/$/, "")}/api/inbox/${id}${key ? `?key=${key}` : ""}`;

export async function listHooks(userId: string): Promise<HookRow[]> {
  return (await q<Raw>("select * from inbox_hooks where user_id = $1 order by created_at", [userId])).map(view);
}

/** A new address — the key comes back once. null when the member already has the most, or the chat isn't theirs. */
export async function createHook(userId: string, name: string, conversationId: string | null): Promise<{ row: HookRow; key: string } | null> {
  const n = cleanName(name);
  if (!n) return null;
  if (conversationId && !(UUID.test(conversationId) && await one("select 1 from conversations where id = $1 and user_id = $2", [conversationId, userId]))) return null;
  const c = await one<{ n: number }>("select count(*)::int as n from inbox_hooks where user_id = $1", [userId]);
  if ((c?.n ?? 0) >= HOOKS_MAX) return null;
  const key = newKey();
  const r = await one<Raw>("insert into inbox_hooks(user_id, name, key_hash, hint, conversation_id) values ($1, $2, $3, $4, $5) returning *",
    [userId, lock(n), hash(key), `uci_…${key.slice(-4)}`, conversationId]);
  return { row: view(r!), key };
}

/** A new key; the old one stops working right away. */
export async function rekeyHook(userId: string, id: string): Promise<string | null> {
  if (!UUID.test(id)) return null;
  const key = newKey();
  const r = await q("update inbox_hooks set key_hash = $3, hint = $4 where id = $1 and user_id = $2 returning id", [id, userId, hash(key), `uci_…${key.slice(-4)}`]);
  return r.length ? key : null;
}

export async function updateHook(userId: string, id: string, p: { enabled?: boolean; per_hour?: number; conversation_id?: string | null }): Promise<boolean> {
  if (!UUID.test(id)) return false;
  if (p.per_hour !== undefined && !(Number.isInteger(p.per_hour) && p.per_hour >= 1 && p.per_hour <= 600)) return false;
  if (p.conversation_id && !(UUID.test(p.conversation_id) && await one("select 1 from conversations where id = $1 and user_id = $2", [p.conversation_id, userId]))) return false;
  const r = await q(`update inbox_hooks set enabled = coalesce($3, enabled), per_hour = coalesce($4, per_hour),
      conversation_id = case when $5::boolean then $6::uuid else conversation_id end where id = $1 and user_id = $2 returning id`,
    [id, userId, p.enabled ?? null, p.per_hour ?? null, p.conversation_id !== undefined, p.conversation_id ?? null]);
  return r.length > 0;
}

/** Removes the address only — the chat and the alerts already in it stay. */
export async function deleteHook(userId: string, id: string): Promise<boolean> {
  if (!UUID.test(id)) return false;
  return (await q("delete from inbox_hooks where id = $1 and user_id = $2 returning id", [id, userId])).length > 0;
}

function keyOk(got: string | null, want: string): boolean {
  if (!got || !/^uci_[A-Za-z0-9_-]{20,}$/.test(got)) return false;
  const a = Buffer.from(hash(got), "hex"), b = Buffer.from(want, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export type Received = { status: 200 | 400 | 401 | 403 | 404 | 429; posted?: boolean; conversation_id?: string; error?: string };

/** One message from the outside service. The address is found without a member (no sign-in there); the note is written as
 *  that member (member lock). Order: address → key → on → hourly limit → words. */
export async function receive(id: string, key: string | null, raw: string, contentType: string | null): Promise<Received> {
  if (!UUID.test(id)) return { status: 404, error: "not_found" };
  const h = await asOwner(() => one<Raw>("select * from inbox_hooks where id = $1", [id]));
  if (!h) return { status: 404, error: "not_found" };
  if (!keyOk(key, h.key_hash)) return { status: 401, error: "bad_key" };
  if (!h.enabled) return { status: 403, error: "turned_off" };
  const text = incomingText(raw.slice(0, BODY_MAX), contentType);
  if (!text) return { status: 400, error: "empty" };
  // this hour's count, in one step (two messages at once can't both slip under the limit)
  const w = await asOwner(() => one<{ win_n: number; per_hour: number }>(`update inbox_hooks set
      win_n = case when win_at < now() - interval '1 hour' then 1 else win_n + 1 end,
      win_at = case when win_at < now() - interval '1 hour' then now() else win_at end
    where id = $1 and enabled returning win_n, per_hour`, [id]));
  if (!w) return { status: 403, error: "turned_off" };
  if (w.win_n > w.per_hour) return { status: 429, error: "too_many" };
  const name = unlock(h.name);
  const conv = await asMember(h.user_id, async () => {
    let c = h.conversation_id && (await one<{ id: string }>("select id from conversations where id = $1", [h.conversation_id]))?.id;
    if (!c) {
      c = (await one<{ id: string }>("insert into conversations(user_id, title, titled) values ($1, $2, true) returning id", [h.user_id, lock(`🔔 ${name}`)]))!.id;
      await q("update inbox_hooks set conversation_id = $2 where id = $1", [id, c]);
    }
    await q("insert into messages(conversation_id, role, content, model, asks) values ($1, 'assistant', $2, $3, false)", [c, lock(alertNote(name, text)), `🔔 ${name}`.slice(0, 80)]);
    await q("update conversations set updated_at = now(), done = false where id = $1", [c]);
    await q("update inbox_hooks set last_at = now() where id = $1", [id]);
    return c;
  });
  const { pushUser } = await import("./push");
  const first = text.split("\n").find((l) => l.trim())?.replace(/[*`#]/g, "").trim().slice(0, 120) ?? "";
  await asMember(h.user_id, () => pushUser(h.user_id, { title: `🔔 ${name}`, body: first, url: `/app?c=${conv}`, tag: `unchore-inbox-${id}` })).catch(() => 0);
  return { status: 200, posted: true, conversation_id: conv };
}
