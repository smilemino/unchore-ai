// Chat privacy. Three layers, so users can trust that nobody at Unchore reads their chats:
//  1. Locked at rest — chat text (messages, titles, summaries, memories, attached files) is stored encrypted (AES-256-GCM).
//     A database dump or a staff query shows only «enc:…». Only the running app opens it, to show it to its owner or send it to their AI.
//  2. Improvement copy — if the user leaves «Help improve Unchore» on, a separate copy of each turn goes to improve_samples
//     with personal details scrubbed out (names they gave, e-mail, phone, card, ID, account, address numbers, keys, links' secrets)
//     and no user id at all (thread = one-way HMAC). That copy is also locked and auto-deleted after 90 days.
//  3. Usage only — every user, on or off, leaves content-free usage events (turn ok/failed, model, time taken) so we can see
//     where people get stuck without reading what they wrote.
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { open, seal } from "./crypto";
import { asOwner, one, q } from "./db";
import { wordsSrc } from "./words";
import W_BANK from "./words/bank_word.json";
import W_PASSWORD from "./words/password_word.json";
import W_NAME from "./words/my_name_is.json";

const TAG = "enc:";
const MAGIC = Buffer.from("UCE1");

function key(): Buffer {
  const k = Buffer.from(process.env.UNCHORE_SECRET_KEY ?? "", "base64");
  if (k.length !== 32) throw new Error("UNCHORE_SECRET_KEY must be 32 bytes (base64)");
  return k;
}

/** Encrypts chat text for storage. */
export function lock(plain: string): string { return TAG + seal(plain); }
export function lockOrNull(plain: string | null | undefined): string | null { return plain == null ? null : lock(plain); }

/** Opens stored chat text. Rows written before locking was switched on are plain and come back as they are. */
export function unlock(stored: string | null | undefined): string {
  if (stored == null) return "";
  if (!stored.startsWith(TAG)) return stored;
  try { return open(stored.slice(TAG.length)); } catch { return "[locked — can't be opened with this server's key]"; }
}
export function unlockOrNull(stored: string | null | undefined): string | null { return stored == null ? null : unlock(stored); }
export function isLocked(stored: string | null | undefined): boolean { return typeof stored === "string" && stored.startsWith(TAG); }

/** Same for file bytes: MAGIC + iv(12) + tag(16) + body. */
export function lockBytes(plain: Buffer): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), body]);
}
export function unlockBytes(stored: Buffer): Buffer {
  const b = Buffer.from(stored);
  if (b.length < 32 || !b.subarray(0, 4).equals(MAGIC)) return b;
  try {
    const d = createDecipheriv("aes-256-gcm", key(), b.subarray(4, 16));
    d.setAuthTag(b.subarray(16, 32));
    return Buffer.concat([d.update(b.subarray(32)), d.final()]);
  } catch { return b; }
}

/** One-way reference (can't be turned back into the id without the server key). */
export function ref(id: string, kind = "u"): string {
  return createHmac("sha256", key()).update(`${kind}:${id}`).digest("base64url").slice(0, 22);
}

// ── Scrubbing personal details out of the improvement copy ──
// [label, pattern, keepLead] — when keepLead, group 1 («my name is », «password: ») stays and only the value is replaced.
const RULES: Array<[string, RegExp, boolean]> = [
  ["[key]", /\b(?:sk|pk|rk|ghp|gho|xox[abp]|AIza|ya29)[-_A-Za-z0-9]{12,}|\b[A-Za-z0-9+/_-]{40,}={0,2}/g, false],
  ["[email]", /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, false],
  ["[link]", /\bhttps?:\/\/\S+/g, false],
  ["[id-number]", /(?<!\d)\d{6}[-\s]?[1-8]\d{6}(?!\d)|\b\d{3}-\d{2}-\d{4}\b/g, false],
  ["[card]", /(?<!\d)(?:\d[-\s.]?){12,18}\d(?!\d)/g, false],
  ["[account]", /(?:은행|계좌|예금주|\bbank\b|\baccount\b|\bacct\b|\biban\b|\brouting\b|\bswift\b)[^\d\n]{0,12}[A-Z]{0,4}\d[\d\s-]{6,}\d/gi, false],
  ["[phone]", /(?<![\d.])(?:\+\d{1,3}[\s-]?)?\(?0?\d{1,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{4}(?![\d.])/g, false],
  ["[password]", /((?:\b(?:password|passwd|pw|pin|otp)\b|비밀번호|비번|암호|인증번호)\s*(?:은|는|이|가|:|=|is)?\s*)\S{3,}/gi, true],
  ["[address]", /[가-힣]+(?:로|길)\s*\d+(?:-\d+)?(?:번길\s*\d+)?|\b\d{1,5}\s+(?:[A-Z][a-z]+\s){1,3}(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Lane|Ln|Dr|Drive)\b\.?/g, false],
  ["[name]", /((?:[Mm]y name is|[Ii] am called|[Ii]'m called|[Cc]all me)\s+)[A-Z][a-z]+(?:\s[A-Z][a-z]+)?/g, true],
  ["[name]", /((?:제|내|저의|나의)\s*이름은\s*)[가-힣]{2,3}/g, true],
  // The same three in the other languages (lib/words): the word before the number/secret/name stays, the value goes.
  ["[account]", new RegExp(`(?:${wordsSrc(W_BANK, true, true)})[^\\d\\n]{0,12}[A-Z]{0,4}\\d[\\d\\s-]{6,}\\d`, "giu"), false],
  ["[password]", new RegExp(`((?:${wordsSrc(W_PASSWORD, true, true)})\\s*[:=：]?\\s*(?:\\p{L}{1,4}\\s+)?)\\S{3,}`, "giu"), true],   // «contraseña es …», «Passwort ist …»
  ["[name]", new RegExp(`((?:${wordsSrc(W_NAME)})\\s*)[\\p{L}\\p{M}]+(?:[ \\t][\\p{Lu}][\\p{L}\\p{M}]*)?`, "giu"), true],
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Removes personal details. `known` = what we already know about this user (their name, e-mail) — removed wherever it appears. */
export function scrub(text: string, known: (string | null | undefined)[] = []): string {
  let t = text;
  for (const k of known) {
    const v = (k ?? "").trim();
    if (!v) continue;
    if (v.includes("@")) { t = t.replace(new RegExp(escapeRe(v), "gi"), "[email]"); continue; }
    for (const part of [v, ...v.split(/\s+/)].filter((p) => p.length >= 2)) {
      const re = /^[A-Za-z]/.test(part) ? new RegExp(`\\b${escapeRe(part)}\\b`, "gi") : new RegExp(escapeRe(part), "g");
      t = t.replace(re, "[name]");
    }
  }
  for (const [label, re, keepLead] of RULES) t = t.replace(re, (...m) => `${keepLead ? m[1] : ""}${label}`);
  return t;
}

// ── Recording ──
export const SAMPLE_DAYS = 90;
export const USAGE_DAYS = 400;

type Who = { id: string; email?: string | null; name?: string | null; lang?: string };

/** After a turn: usage event for everyone; scrubbed, locked improvement copy only when the user left «Help improve» on. Never throws. */
export async function recordTurn(u: Who, t: { convId: string; question: string; answer: string; model: string; ms: number; ok: boolean; noSample?: boolean }): Promise<void> {
  try {
    await q("insert into usage_events(user_ref, kind, model, ms, ok) values ($1, 'turn', $2, $3, $4)", [ref(u.id), t.model, Math.round(t.ms), t.ok]);
    if (t.noSample) return;   // work done on the member's own computer (lib/computers.ts) may hold their private files — no copy
    const s = await one<{ improve: boolean; name: string | null; email: string }>("select improve, name, email from users where id = $1", [u.id]);
    if (!s?.improve) return;
    const known = [s.name, s.email];
    await q("insert into improve_samples(thread, lang, model, question, answer, ok) values ($1, $2, $3, $4, $5, $6)",
      [ref(t.convId, "c"), u.lang ?? null, t.model, lock(scrub(t.question, known).slice(0, 8000)), lock(scrub(t.answer, known).slice(0, 8000)), t.ok]);
  } catch { /* never block a chat for this */ }
}

/** A chat that holds Google data (a Calendar/Drive read, a file picked from Drive): mark it so no later turn is copied for
 *  improvement, and delete the copies already made from it. Returns whether the chat was newly marked. Never throws. */
export async function markGoogleChat(convId: string): Promise<boolean> {
  try {
    const r = await q("update conversations set google_data = true where id = $1 and not google_data returning 1", [convId]);
    if (r.length) await asOwner(() => q("delete from improve_samples where thread = $1", [ref(convId, "c")]));
    return r.length > 0;
  } catch { return false; }
}

/** Does this chat hold Google data (marked, or a file from Google Drive attached to it)? Fails closed — true on error. */
export async function chatHasGoogleData(convId: string): Promise<boolean> {
  try {
    const r = await one<{ g: boolean }>("select (c.google_data or exists (select 1 from files f where f.conversation_id = c.id and f.from_google)) as g from conversations c where c.id = $1", [convId]);
    return Boolean(r?.g);
  } catch { return true; }
}

/** Content-free event (e.g. «no_key», «automation_created»). Never throws. */
export async function recordEvent(userId: string, kind: string, extra: { model?: string | null; ok?: boolean } = {}): Promise<void> {
  try { await q("insert into usage_events(user_ref, kind, model, ok) values ($1, $2, $3, $4)", [ref(userId), kind.slice(0, 40), extra.model ?? null, extra.ok ?? null]); } catch { /* ignore */ }
}

/** Nightly: drop old improvement copies and old usage events. */
export async function prunePrivacy(): Promise<{ samples: number; events: number }> {
  const a = await q("delete from improve_samples where created_at < now() - ($1 || ' days')::interval returning 1", [String(SAMPLE_DAYS)]);
  const b = await q("delete from usage_events where created_at < now() - ($1 || ' days')::interval returning 1", [String(USAGE_DAYS)]);
  return { samples: a.length, events: b.length };
}
