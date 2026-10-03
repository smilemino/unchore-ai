// «Your turn» second look (AI Soul lib/ask-sweep.ts · owner 2026-10-02 «chats sit in "answer" though there is nothing for me to answer»).
// On AI Soul 11 of 15 waiting chats needed nothing: answered in another chat, the same question in two chats, a «what do I need to
// answer?» summary chat repeating other chats' questions, a link whose time had run out, or «tell me after your call» that blocks nothing.
// Each answer is judged alone when it's saved (lib/turn-mark.ts), so nothing looks across chats. Every 30 minutes, before the tidy
// (lib/auto-done.ts), the member's own small AI sees all their 🟠 chats with what they wrote lately in every chat; a chat it lets go
// gets asks = false and the tidy moves it to «Done». Only the member's own keys/plans — never gift or bought credit (the member's money
// stays theirs, Unchore's stays ours). Off per member with the same «your turn judge» switch (users.ask_judge).
import { complete, fastModel, firstJson, userKeys, providerOf, type Provider } from "./ai";
import { q } from "./db";
import { unlock } from "./privacy";

export const SWEEP_MIN_AGE_MIN = 10;    // give the per-answer judge and a quick reply time first
export const SWEEP_DAYS = 14;           // older waiting answers are left alone
export const SWEEP_HOURS = 48;          // what the member wrote in this window, every chat
export const SWEEP_SAID_MAX = 80;
export const SWEEP_REDO_MIN = 120;      // nothing new from the member → look again at most this often (a link's time runs out by itself)
export const SWEEP_MEMBERS = 15;        // per run (the timer gives five minutes)

export type SweepKind = "keep" | "moot" | "dup" | "relay" | "expired";
export interface SweepChat { id: string; title: string; at: string; tail: string }
export interface SweepSaid { chat: string; title: string; at: string; text: string }

export const SWEEP_SYSTEM = [
  "You tidy the «Your turn» list of an AI assistant: chats where the assistant waits for the user. The user wants it to hold only what they really must answer now.",
  "For each chat pick one: keep | moot | dup | relay | expired.",
  "- keep: the user must answer or act for the work to go on and has not yet. When unsure, keep.",
  "- moot: the user already answered this in another chat, said to drop it / leave it / they'll do it later, or it is a request that blocks nothing («tell me after your call», «let me know if…»).",
  "- dup: the same question (same task, link or file) also waits in another chat — keep the one where the work happens, mark the others dup.",
  "- relay: this chat only reports other chats' questions (the user asked «what do I need to answer?» or «what's in progress?»).",
  "- expired: it asks to open a link / log in / confirm, the answer gives the link's time («closes at 3 pm», «within an hour») and that time has passed. No time written → not expired.",
  "A payment or a fact only the user knows stays keep unless the user clearly answered.",
  "Reply with JSON only: {\"chats\":[{\"id\":\"first 8 characters\",\"kind\":\"keep|moot|dup|relay|expired\"}]}",
].join("\n");

const when = (iso: string, tz: string) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(Date.parse(iso));
export function sweepInput(chats: SweepChat[], said: SweepSaid[], tz: string, now = Date.now()): string {
  const list = chats.map((c, i) => `[${i + 1}] chat ${c.id.slice(0, 8)} «${c.title}» — answered ${when(c.at, tz)}\n…${c.tail.replace(/\s+/g, " ").slice(-1200)}`).join("\n\n");
  const lines = said.length ? said.map((s) => `- ${when(s.at, tz)} chat ${s.chat.slice(0, 8)} «${s.title.slice(0, 40)}»: ${s.text.replace(/\s+/g, " ").slice(0, 220)}`).join("\n") : "(none)";
  return `Now: ${when(new Date(now).toISOString(), tz)}\n\nWAITING CHATS (${chats.length})\n${list}\n\nWHAT THE USER WROTE IN THE LAST ${SWEEP_HOURS} HOURS, ANY CHAT, NEWEST FIRST\n${lines}`;
}

/** The chats to let go (ids from `chats`); null when the reply can't be read — then nothing changes. */
export function parseSweep(raw: string, chats: SweepChat[]): Array<{ id: string; kind: Exclude<SweepKind, "keep"> }> | null {
  const j = firstJson<{ chats?: Array<{ id?: unknown; kind?: unknown }> }>(raw);
  if (!j || !Array.isArray(j.chats)) return null;
  const out: Array<{ id: string; kind: Exclude<SweepKind, "keep"> }> = [];
  for (const v of j.chats) {
    const short = String(v?.id ?? "").trim().toLowerCase().slice(0, 8);
    const hits = short.length === 8 ? chats.filter((x) => x.id.toLowerCase().startsWith(short)) : [];
    const c = hits.length === 1 ? hits[0] : undefined;   // two chats sharing the first 8 characters: let neither go (AI Soul 266883a)
    const kind = String(v?.kind ?? "");
    if (c && ["moot", "dup", "relay", "expired"].includes(kind) && !out.some((o) => o.id === c.id)) out.push({ id: c.id, kind: kind as Exclude<SweepKind, "keep"> });
  }
  return out;
}

/** The member's own keys only — gift or bought credit («credit») is never spent on tidying. */
export function ownKeys(keys: Partial<Record<Provider, string>>): Partial<Record<Provider, string>> {
  return Object.fromEntries(Object.entries(keys).filter(([p]) => p !== "credit")) as Partial<Record<Provider, string>>;
}

/** Look again? A chat never looked at, something new from the member since, or SWEEP_REDO_MIN gone by. */
export function sweepDue(m: { swept: string | Date | null; fresh: boolean; newest: string | Date | null }, now: number): boolean {
  if (m.fresh || !m.swept) return true;
  const swept = new Date(m.swept).getTime();
  return now - swept > SWEEP_REDO_MIN * 60_000 || (!!m.newest && new Date(m.newest).getTime() > swept);
}

/** The member's waiting chats, oldest first (the per-answer judge's 🟠 that is old enough). */
export async function waitingChats(userId: string): Promise<Waiting[]> {
  return q<Waiting>(`select m.id as msg_id, c.id as conv_id, c.title, m.created_at as at, m.content, m.turn_swept_at as swept
    from conversations c join lateral (select m.id, m.role, m.asks, m.created_at, m.content, m.turn_swept_at from messages m where m.conversation_id = c.id order by m.created_at desc, (m.role = 'assistant') desc limit 1) m on true
    where c.user_id = $1 and not c.done and m.role = 'assistant' and m.asks = true
      and m.created_at < now() - make_interval(mins => $2) and m.created_at > now() - make_interval(days => $3)
    order by m.created_at limit 20`, [userId, SWEEP_MIN_AGE_MIN, SWEEP_DAYS]);
}
/** Stamps the look on every judged answer and lets go `drop` — only if it is still the chat's last message and still waiting
 *  (the member may have written meanwhile). Returns how many were let go. */
export async function markSwept(ids: string[], drop: string[]): Promise<number> {
  if (ids.length) await q("update messages set turn_swept_at = now() where id = any($1::uuid[])", [ids]);
  if (!drop.length) return 0;
  return (await q(`update messages m set asks = false where m.id = any($1::uuid[]) and m.asks = true
    and not exists (select 1 from messages n where n.conversation_id = m.conversation_id and n.created_at > m.created_at) returning m.id`, [drop])).length;
}

type Waiting = { msg_id: string; conv_id: string; title: string; at: string; content: string; swept: string | null };
/** One pass. Returns how many chats let go. */
export async function turnSweep(deadline: number): Promise<{ members: number; let_go: number }> {
  const found = await q<{ user_id: string; tz: string | null; newest: string | null; swept: string | null; fresh: boolean }>(`select c.user_id, u.tz, min(m.turn_swept_at) as swept, bool_or(m.turn_swept_at is null) as fresh,
      (select max(m2.created_at) from messages m2 join conversations c2 on c2.id = m2.conversation_id where c2.user_id = c.user_id and m2.role = 'user') as newest
    from conversations c join users u on u.id = c.user_id
    join lateral (select m.role, m.asks, m.created_at, m.turn_swept_at from messages m where m.conversation_id = c.id order by m.created_at desc, (m.role = 'assistant') desc limit 1) m on true
    where not c.done and u.ask_judge <> false and m.role = 'assistant' and m.asks = true
      and m.created_at < now() - make_interval(mins => $1) and m.created_at > now() - make_interval(days => $2)
    group by c.user_id, u.tz`, [SWEEP_MIN_AGE_MIN, SWEEP_DAYS]);
  const members = found.filter((m) => sweepDue(m, Date.now())).slice(0, SWEEP_MEMBERS);
  let done = 0, let_go = 0;
  for (const mem of members) {
    if (Date.now() > deadline) break;
    const keys = ownKeys(await userKeys(mem.user_id));
    const model = fastModel(keys);
    if (!model || !keys[providerOf(model)]) continue;   // no key of their own — the per-answer rule stays
    const rows = await waitingChats(mem.user_id);
    if (!rows.length) continue;
    const said = await q<{ chat: string; title: string; at: string; content: string }>(`select c.id as chat, c.title, m.created_at as at, m.content from messages m join conversations c on c.id = m.conversation_id
      where c.user_id = $1 and m.role = 'user' and m.created_at > now() - make_interval(hours => $2) order by m.created_at desc limit $3`, [mem.user_id, SWEEP_HOURS, SWEEP_SAID_MAX]);
    const chats: SweepChat[] = rows.map((r) => ({ id: r.conv_id, title: unlock(r.title), at: new Date(r.at).toISOString(), tail: unlock(r.content).slice(-2000) }));
    const text: SweepSaid[] = said.map((s) => ({ chat: s.chat, title: unlock(s.title), at: new Date(s.at).toISOString(), text: unlock(s.content) })).filter((s) => !s.text.trimStart().startsWith("⏰"));   // reminder prompts are not the member
    let raw = "";
    try { raw = await complete({ model, key: keys[providerOf(model)]!, maxTokens: 800, side: true, system: SWEEP_SYSTEM, messages: [{ role: "user", content: sweepInput(chats, text, mem.tz || "UTC") }], timeoutMs: 60_000 }); } catch { continue; }
    const go = parseSweep(raw, chats);
    if (!go) continue;
    done++;
    let_go += await markSwept(rows.map((r) => r.msg_id), rows.filter((r) => go.some((g) => g.id === r.conv_id)).map((r) => r.msg_id));
  }
  return { members: done, let_go };
}
