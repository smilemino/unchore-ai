// One row of the conversation list — the same look as AI Soul's (lib/conv-line.ts there · owner 2026-09-29 «make it look exactly like AI Soul»).
import { k, type Tr } from "./i18n";
import { unreadOf, type ReadRow } from "./read-marks";
import { wordsSrc } from "./words";
import W_CONCLUSION from "./words/heading_conclusion.json";
// [status circle: working · reply · done · idle] title ········ time
//                                   [project tag] one line from the last answer

export type DotState = "working" | "turn" | "done" | "idle";
// quiet — no word inside: «nothing to do» is an empty circle so the eye goes to «Busy» and «Reply» (AI Soul 513863b · owner 2026-09-30 «is «Idle» needed at all?»)
export const DOT: Record<DotState, { bg: string; en: string; quiet?: true }> = {
  working: { bg: "bg-blue-600 text-white ring-3 ring-blue-200 dark:ring-blue-900", en: k("Busy") },
  turn: { bg: "bg-orange-500 text-white", en: k("Reply#dot") },
  done: { bg: "bg-emerald-600 text-white", en: k("Done") },
  idle: { bg: "bg-surface text-muted border-2 border-line-3", en: k("Idle"), quiet: true },
};
export type ListRow = { id: string; title: string; updated_at: string; pinned: boolean; project_id: string | null; done: boolean; last_role: string | null; last_at?: string | null; ai_count?: number; seen_ai?: number; last_text?: string | null; asks?: boolean | null; hold?: string | null; hit?: { id: string; text: string } | null };

/** An answer can't still be coming after this long (the server gives up on a turn well before) — an older unanswered question means it failed. */
export const BUSY_MAX_MS = 10 * 60_000;

/** Busy = the last message is the user's and recent (an answer is being written), or the last answer ends on «⏳ In progress — …»
 *  (waiting on something outside — lib/hold-line.ts; before «your turn», like AI Soul); your turn = the last answer waits for the
 *  member (lib/turn-mark.ts); done = marked done; else idle. */
export function dotState(r: Pick<ListRow, "done" | "last_role" | "last_at"> & { asks?: boolean | null; hold?: string | null }, now: number = Date.now()): DotState {
  if (r.last_role === "user" && (!r.last_at || now - Date.parse(r.last_at) < BUSY_MAX_MS)) return "working";
  if (r.last_role === "assistant" && r.hold && !r.done) return "working";
  if (r.last_role === "assistant" && r.asks && !r.done) return "turn";
  return r.done ? "done" : "idle";
}

export const PROJECT_COLOR = ["bg-violet-600", "bg-pink-600", "bg-cyan-600", "bg-amber-700", "bg-fuchsia-700", "bg-lime-700"];
export function projectColor(projectId: string | null | undefined): string {
  if (!projectId) return "";
  let h = 0;
  for (const ch of projectId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PROJECT_COLOR[h % PROJECT_COLOR.length]!;
}
/** Tag text — the project's first word (two if the first is ≤3 latin letters), at most 6 characters (AI Soul's rule). */
export function projectTag(name: string | null | undefined): string {
  const w = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!w.length) return "";
  const t = /^[A-Za-z0-9]{1,3}$/.test(w[0]!) && w[1] ? `${w[0]} ${w[1]}` : w[0]!;
  return Array.from(t).slice(0, 7).join("");
}

/** Right-hand time: today «09:41», yesterday «Yesterday» in the screen's language, before that «9/23» (the language's own short date) — in the given time zone. */
export function timeText(iso: string | null | undefined, { lang, t }: Tr, tz: string, now = Date.now()): string {
  const ms = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(ms)) return "";
  const day = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
  const diff = Math.round((Date.parse(day(now)) - Date.parse(day(ms))) / 86_400_000);
  if (diff <= 0) return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(ms);
  if (diff === 1) return t("Yesterday");
  if (lang !== "en" && lang !== "ko") return new Intl.DateTimeFormat(lang, { timeZone: tz, month: "numeric", day: "numeric" }).format(ms);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "numeric", day: "numeric" }).formatToParts(ms).map((x) => [x.type, x.value]));
  return `${p.month}/${p.day}`;
}

const CONCLUSION_ANY = new RegExp(`^(?:${wordsSrc(W_CONCLUSION, false)})\\s*[:：]`, "iu");   // every other language (lib/words)
/** The line under a title: the «결론:» / «Conclusion:» line if the answer has one, else its first line. */
export function previewLine(text: string): string {
  const lines = text.split("\n").map((l) => l.replace(/[#>*_`|]/g, "").trim()).filter(Boolean);
  const hit = lines.find((l) => /^(결론|Conclusion|Summary)\s*[:：]/i.test(l) || CONCLUSION_ANY.test(l));
  return (hit ?? lines[0] ?? "").slice(0, 120);
}

export type GroupKey = "pin" | "working" | "turn" | "rest" | "done";
export type ListGroup<T> = { key: GroupKey; head: string; rows: T[] };
/** More done chats than this → show the latest and fold the rest behind «N more» (AI Soul: FOLD_AT). */
export const FOLD_AT = 5;
const HEAD: Record<Exclude<GroupKey, "rest">, string> = { pin: k("📌 Pinned"), working: k("🔵 In progress"), turn: k("🟠 Your turn"), done: k("Done") };

/** Waiting for the member, oldest first — the first screen's «your turn» line and the app icon number (AI Soul lib/owner-turn.ts). */
export function turnRows<T extends ListRow>(rows: T[]): T[] {
  return rows.filter((r) => dotState(r) === "turn").sort((a, b) => Date.parse(a.last_at ?? a.updated_at) - Date.parse(b.last_at ?? b.updated_at));
}

/** Groups in AI Soul's order: pinned → in progress → your turn → chats → done. Empty groups drop out. */
export function groupRows<T extends ListRow>(rows: T[], t: Tr["t"]): ListGroup<T>[] {
  const g: Record<GroupKey, T[]> = { pin: [], working: [], turn: [], rest: [], done: [] };
  for (const r of rows) { const st = dotState(r); (r.pinned ? g.pin : st === "working" ? g.working : st === "turn" ? g.turn : r.done ? g.done : g.rest).push(r); }
  const out: ListGroup<T>[] = [];
  const push = (k: Exclude<GroupKey, "rest">) => { if (g[k].length) out.push({ key: k, head: `${t(HEAD[k])} ${g[k].length}`, rows: g[k] }); };
  push("pin"); push("working"); push("turn");
  if (g.rest.length || (!out.length && !g.done.length)) out.push({ key: "rest", head: t("Chats"), rows: g.rest });
  push("done");
  return out;
}

/** The list as drawn: while searching, one «Found» group in the server's order; otherwise groupRows. Shared by the left list and
 *  the phone first screen (components/HomeList.tsx), so both show the same groups. */
export function listGroups<T extends ListRow>(rows: T[], term: string, t: Tr["t"]): ListGroup<T>[] {
  return term.trim() ? [{ key: "rest", head: t("Found"), rows }] : groupRows(rows, t);
}

/** What the left list (Shell) shares with the phone first screen: its rows, project names and time zone — one request, not two. */
export type ListShare = { rows: ListRow[]; projects: Record<string, string>; tz: string };
export const LIST_EVENT = "uc:list";

/** Fold the done group past FOLD_AT rows unless opened; the chat you're looking at and chats with unread answers stay visible
 *  (the 30-minute tidy moves unread chats too — lib/auto-done.ts). */
export function foldRows<T extends ReadRow>(g: ListGroup<T>, opened: boolean, current: string | null): { rows: T[]; hidden: number } {
  if (g.key !== "done" || opened || g.rows.length <= FOLD_AT) return { rows: g.rows, hidden: 0 };
  const rows = g.rows.filter((r, i) => i < FOLD_AT || r.id === current || unreadOf(r) > 0);
  return { rows, hidden: g.rows.length - rows.length };
}

/** The words around a search match, for the «Found in a message» line under a chat (AI Soul ConvItem «찾은 글»): about `room`
 *  characters each side, cut at a word where it can, «…» where cut. Case-insensitive; null when the term isn't there. */
export function hitSnippet(text: string, term: string, room = 40): string | null {
  const flat = text.replace(/\s+/g, " ").trim();
  const at = flat.toLowerCase().indexOf(term.toLowerCase());
  if (!term || at < 0) return null;
  let a = Math.max(0, at - room), b = Math.min(flat.length, at + term.length + room);
  if (a > 0) { const sp = flat.indexOf(" ", a); if (sp > 0 && sp < at) a = sp + 1; }
  if (b < flat.length) { const sp = flat.lastIndexOf(" ", b); if (sp > at + term.length) b = sp; }
  return `${a > 0 ? "…" : ""}${flat.slice(a, b)}${b < flat.length ? "…" : ""}`;
}
