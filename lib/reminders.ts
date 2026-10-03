// Timed instructions in chat (ported from AI Soul «예약»). When the user asks for something on a clock
// («every 5 minutes…», «in 30 minutes…», «every day at 9…»), the AI writes a reminder block; the app stores it as an
// automation with recipe "prompt" and the scheduler asks the AI again at that time, posting into the same chat.
// Three ways it ends: the AI writes <<<remind-stop>>> · the user says stop · the time limit passes.

import { afterNumberRe, exactRe, wordsRe, wordsSrc } from "./words";
import W_ASK from "./words/remind_ask.json";
import W_SCHED from "./words/schedule_ask.json";
import W_EVERY from "./words/time_every.json";
import W_WHEN from "./words/time_when.json";
import W_UNIT from "./words/time_unit.json";
import W_STOP from "./words/remind_stop.json";
import W_DECLINE from "./words/remind_decline.json";
import W_STOP_BARE from "./words/stop_bare.json";
import W_BELOW from "./words/price_below.json";
import W_ABOVE from "./words/price_above.json";
import { calendar } from "./schedule";
import { ownWords } from "./own-words";

// Korean and English are the hand-written patterns below; every other language comes from lib/words (lib/words.ts).
const SCHED_ANY = wordsRe(W_SCHED);
const ASK_ANY = wordsRe(W_ASK), EVERY_ANY = wordsRe(W_EVERY), WHEN_ANY = wordsRe(W_WHEN), UNIT_ANY = afterNumberRe(W_UNIT);
const DECLINE_ANY = wordsRe(W_DECLINE);
const STOP_ANY = wordsRe(W_STOP), STOP_BARE_ANY = exactRe(W_STOP_BARE);

export type ReminderKind = "every" | "after" | "daily" | "at" | "days" | "monthly" | "yearly";
export type ReminderProposal = { kind: ReminderKind; spec: string; forSpec: string | null; prompt: string; title?: string };

export const REMIND_RE = /<<<(?:remind|예약)\s+(every|after|daily|at|days|monthly|yearly)=([0-9:T@-]+[mhd]?)(?:\s+for=(\d+[mhd]))?\s*>>>\s*([\s\S]*?)\s*<<<(?:end|끝)>>>/g;
export const STOP_RE = /<<<(?:remind-stop|예약끝)>>>/g;
/** A reminder run with nothing worth telling (the price line not crossed, nothing new): no message, no notification this time. */
export const QUIET_RE = /<<<(?:quiet|조용히)>>>/g;
const UNIT: Record<string, number> = { m: 60_000, h: 3_600_000, d: 86_400_000 };
const DAY = 86_400_000;

export function durMs(s: string): number | null { const m = /^(\d+)([mhd])$/.exec(s); return m ? Number(m[1]) * UNIT[m[2]!]! : null; }

/** Did the user's own message ask for something on a clock? The AI may not start reminders on its own. */
export function askedTimed(raw: string): boolean {
  const text = ownWords(raw);   // quoted / fenced words are someone else's (a pasted spec or AI answer), not the member's ask
  return /\d+\s*(분|시간|일)\s*(마다|간격|뒤|후|있다가)|매\s*(일|시간|주|달|월|년|해)|날마다|달마다|해마다|\d{1,2}\s*시(\s*\d{1,2}\s*분)?\s*(에|마다)/.test(text)
    || /\b(every\s+(\d+\s*)?(min(ute)?s?|hours?|days?|morning|evening|night|week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|in\s+\d+\s*(min(ute)?s?|hours?|days?)|at\s+\d{1,2}(:\d{2})?\s*(am|pm)?|daily|hourly|monthly|yearly|annually|remind me|tomorrow at|each (day|morning|week))\b/i.test(text)
    || EVERY_ANY.test(text) || UNIT_ANY.test(text)   // other languages: «毎朝», «alle 5 Minuten», «30分後»
    || SCHED_RE.test(text) || SCHED_ANY.test(text);
}
/** «Schedule it» / «알아서 예약해 줘» is a timed ask even without a clock time — the AI picks the time and says so
 *  (AI Soul 2026-10-01 record review: 39 answers set a reminder the member asked for and still got «no time given»). */
const SCHED_RE = /예약\s*(해|걸어|을\s*걸|으로|해서)|알아서[^\n]{0,20}(예약|일정)|\b(schedule (it|this|that)|set (a|the) schedule|set it to run)\b/i;
/** The ask is often spread over a few messages («remind me of my deadline» → «this Friday» → «the evening before at 8»).
 *  Night test 2026-09-30: 2 of 10 new members asked for a dated reminder this way and got «you didn't give a time».
 *  So a reminder may also start when one of the member's last three messages asks to be reminded and one names a time or day. */
const ASK_RE = /알려|알림|챙겨|깨워|켜\s*(줘|주세요|주실)|remind|alert|notify|ping me|let me know|tell me (?:when|if)|(turn|switch) (it |that )?on|set (it |that )?up/i;
const WHEN_RE = /(오전|오후|아침|저녁|밤|새벽|낮)\s*\d{1,2}\s*시|\d{1,2}\s*시\s*(반|\d{1,2}\s*분)?|\d{1,2}\s*월\s*\d{1,2}\s*일|내일|모레|다음\s*주|이번\s*주|[월화수목금토일]요일|하루\s*전|\d+\s*일\s*전|\b(\d{1,2}(:\d{2})?\s*(am|pm)|\d{1,2}:\d{2}|tomorrow|tonight|next week|(mon|tues|wednes|thurs|fri|satur|sun)day|the day before|\d+\s*days? before)\b/i;
export function askedTimedRecent(said: string[]): boolean {
  // Six, not three: base test 2026-09-30 — «매일 아침 8시에 알려 주면 좋겠어요» came five messages before «그거 지금 켜 주세요».
  const last = said.slice(-6), own = last.map(ownWords);
  if (last.length && askedTimed(last[last.length - 1]!)) return true;
  // The ask must be the member's own words; a time inside quotes counts only when none is said outside them (AI Soul 9712028 —
  // «"오늘 밤 11시" 알려 줘» is the member stressing a time; a quoted span like «"30分後"» is never one — only clock times and days).
  const clock = (t: string) => WHEN_RE.test(t) || WHEN_ANY.test(t) || /\d{1,2}:\d{2}/.test(t);
  return own.some((t) => ASK_RE.test(t) || ASK_ANY.test(t)) && (own.some((t) => clock(t) || UNIT_ANY.test(t)) || last.some(clock));
}
/** «1,400원 넘으면 알려 주세요» / «tell me when Bitcoin drops below 90,000»: a line and a «tell me» in the member's own last message is a
 *  reminder request by itself — how often is the AI's pick (every=1h, the guide). Night 2026-10-03 #8: no time word, so nothing was set
 *  while the answer said «I'll check every hour», and it took two more turns to switch on. */
export function askedLineNow(said: string[]): boolean {
  const t = afterDecline(ownWords(said[said.length - 1] ?? ""));
  if (t === null || ABOUT_IT.test(t) || askedStop(t)) return false;
  return (ASK_RE.test(t) || ASK_ANY.test(t)) && priceLine(t) !== null;
}
/** «알려 주지 마세요» ends the ask — unless another ask follows it («1,400원은 알려 주지 마. 대신 1,500원 넘으면 알려 줘», «…don't tell me
 *  that; tell me when it drops below 90,000»): then only what comes after counts (AI Soul 45675a3 · review P1·P2). null = declined. */
export function afterDecline(text: string): string | null {
  const re = new RegExp(NOT_TELL.source, "gi");
  let last = -1, m: RegExpExecArray | null;
  while ((m = re.exec(text))) last = m.index + m[0].length;
  if (last < 0) return text;
  const tail = text.slice(last);
  return ASK_RE.test(tail) || ASK_ANY.test(tail) || askedTimed(tail) ? tail : null;   // a «tell me» ask or a time ask in the member's own words (lib/words — every language)
}
/** «알려 주지 마세요» / «don't tell me» names the line too — it is the opposite of an ask (night 2026-10-03 review: both read as «switch it on»). */
const NOT_TELL = /(알려|알리|챙겨|깨워)\s*(주지|주시지)?\s*(마|말)|알림\s*(은|도)?\s*(필요\s*없|하지\s*마|보내지\s*마|끄|꺼)|\b(don'?t|do not|never|no need to)\s+(tell|notify|alert|remind|ping|message)\b/i;
/** «알림이 오는 원리를 설명해 주세요» / «how does the alert work?» asks about alerts, not for one. */
const ABOUT_IT = /원리|설명|어떻게\s*(되|돼|작동|동작|오|와)|왜\s|방법|\b(explain|how (does|do|would|will) (it|the|an|this|that|alerts?|reminders?)|why)\b/i;
/** A line ask lends permission only to a reminder on the same line — not the AI's other ideas (2026-10-03 review). */
export function sameLine(said: string, prompt: string): boolean {
  const a = priceLine(afterDecline(ownWords(said)) ?? ""), b = priceLine(prompt);
  return !!a && !!b && a.kind === b.kind && a.value === b.value;
}
/** Earlier messages lend their time words to a reminder only within 12 hours — a time said in passing days ago must not
 *  become today's permission (AI Soul b768aa2). A message with no known time keeps working as before. */
export const SAID_WINDOW_MS = 12 * 3600_000;
export function saidRecently(at: string | Date | null | undefined, now: number): boolean {
  if (at == null) return true;
  const t = new Date(at).getTime();
  return !Number.isFinite(t) || now - t <= SAID_WINDOW_MS;
}
/** What to check live before answering: the member's words, or a reminder's own task (without the «started by a reminder» note);
 *  null for the daily note («⏰ ☀»), which needs no live value. */
export function liveQuestion(d: { text: string; reminder?: boolean }): string | null {
  if (!d.reminder) return d.text;
  if (d.text.startsWith("⏰ ☀")) return null;
  // Said as a need for the current value: «tell me when it drops below 50,000» alone reads as no live question (round 11).
  return `Scheduled check — read the current value this task depends on, now: ${d.text.split("\n\n(")[0]!}`;
}
/** A price/rate line in a reminder's task: «50,000달러 아래로 떨어지면», «1,400원 넘으면», «below $90,000», «1만 5천원 이하».
 *  With it the app can read the value itself on each run and stay silent (no AI call) until the line is crossed (night round 13). */
export type PriceLine = { kind: "below" | "above"; value: number };
const NUM = "(\\d[\\d,]*(?:\\.\\d+)?)\\s*(만)?";
const DOWN = "아래|이하|밑|미만|떨어지|내려가|below|under|less than|drops? (?:below|under|to)|falls? (?:below|under|to)";
const UP = "넘|이상|초과|오르|올라|위로|above|over|exceeds?|more than|rises? (?:above|over|to)|goes (?:above|over)";
// «N보다 낮으면/높으면» (the AI writes the task this way: «218,990원보다 낮으면 알려 주세요»).
const CMP_DOWN = "낮|싸|적|아래|밑|내려|떨어", CMP_UP = "높|비싸|많|위|넘|오르|올라";
/** Sentences that say when to stay silent («…이상이면 아무것도 보내지 않아요», «If it is at or above $82,000, answer only <<<quiet>>>»)
 *  name the line the other way round — only the part that says when to tell is read (night 2026-10-03: a drop alert became «above»,
 *  so a real drop would have stayed silent). */
const SILENT = /<<<quiet>>>|\bquiet\b|\bsilent|\bnothing\b|\bdon'?t (?:send|tell|message|notify)|보내지 않|알리지 않|조용히|넘어가/i;
function tellPart(t: string): string {
  const kept = t.split(/(?<=[.!?。])\s+|\n+/).filter((p) => !SILENT.test(p));
  return kept.length ? kept.join(" ") : t;
}
export function priceLine(text: string): PriceLine | null {
  const t = tellPart(text).replace(/\s+/g, " ");
  const after = new RegExp(`${NUM}\\s*(?:원|달러|불|usd|krw|dollars?)?\\s*(?:을|를|이|가|에서|로|으로)?\\s*(${DOWN}|${UP})`, "i").exec(t);
  const before = new RegExp(`(${DOWN}|${UP})\\s*(?:\\$|₩|usd|krw)?\\s*${NUM}`, "i").exec(t);
  const cmp = new RegExp(`${NUM}\\s*(?:원|달러|불|usd|krw|dollars?)?\\s*보다\\s*(?:더\\s*)?(${CMP_DOWN}|${CMP_UP})`, "i").exec(t);
  // The earliest one wins — the task says when to tell first.
  const all = [
    after && { at: after.index, n: after[1]!, man: after[2], down: new RegExp(`^(${DOWN})`, "i").test(after[3]!) },
    before && { at: before.index, n: before[2]!, man: before[3], down: new RegExp(`^(${DOWN})`, "i").test(before[1]!) },
    cmp && { at: cmp.index, n: cmp[1]!, man: cmp[2], down: new RegExp(`^(${CMP_DOWN})`).test(cmp[3]!) },
  ].filter((x): x is { at: number; n: string; man: string | undefined; down: boolean } => Boolean(x));
  const m = all.sort((a, b) => a.at - b.at)[0];
  if (!m) return priceLineAny(t);
  const value = Number(m.n.replace(/,/g, "")) * (m.man ? 10_000 : 1);
  if (!Number.isFinite(value) || value <= 0) return null;
  return { kind: m.down ? "below" : "above", value };
}
/** Other languages: a «below/above» word and the number nearest to it (within 30 characters) — «5万円を下回ったら», «unter 90.000 $».
 *  «万/萬» counts ten thousand. Thousands separators: «,» «.» «'» and spaces between groups of three. */
const BELOW_ANY = new RegExp(wordsSrc(W_BELOW), "iu"), ABOVE_ANY = new RegExp(wordsSrc(W_ABOVE), "iu");
function priceLineAny(t: string): PriceLine | null {
  const b = BELOW_ANY.exec(t), a = ABOVE_ANY.exec(t);
  const hit = b && (!a || b.index <= a.index) ? { at: b.index, kind: "below" as const } : a ? { at: a.index, kind: "above" as const } : null;
  if (!hit) return null;
  let best: { d: number; v: number } | null = null;
  for (const n of t.matchAll(/(\d{1,3}(?:[.,' ]\d{3})+|\d+)(?:[.,](\d{1,2}))?\s*(万|萬)?/g)) {
    const v = (Number(n[1]!.replace(/[.,' ]/g, "")) + (n[2] ? Number(`0.${n[2]}`) : 0)) * (n[3] ? 10_000 : 1);
    const d = Math.min(Math.abs(n.index! - hit.at), Math.abs(n.index! + n[0].length - hit.at));
    if (v > 0 && Number.isFinite(v) && d <= 30 && (!best || d < best.d)) best = { d, v };
  }
  return best ? { kind: hit.kind, value: best.v } : null;
}
export function crossed(line: PriceLine, v: number): boolean {
  return line.kind === "below" ? v < line.value : v > line.value;
}

/** voice: in voice mode a bare «그만»/«stop» means «stop talking», not «stop my reminders» — only the explicit form counts there
 *  (2026-09-30 sync check: saying «stop» to cut the speech silently paused the chat's reminders). */
export function askedStop(text: string, voice = false): boolean {
  if (/(예약|알림|반복)[^\n]{0,6}?(그만|멈춰|중지|취소|꺼)/.test(text) || /\b(stop|cancel|turn off|pause)\s+(the\s+|all\s+|my\s+)?(reminders?|remind(ing)?|alerts?)\b/i.test(text) || STOP_ANY.test(text)) return true;
  if (declinedReminder(text)) return true;
  return !voice && (/^\s*(그만|멈춰)\s*[.!~]*\s*$/.test(text) || /^\s*stop\s*[.!]*\s*$/i.test(text) || STOP_BARE_ANY.test(text));
}

/** «예약은 안 해도 됩니다», «알림은 필요 없어요», «no need for a reminder» — said as a statement, not asked as a question
 *  («예약 안 해도 되나요?» stops nothing). AI Soul 2026-10-01 record review: «no reminder» wasn't heard, so «cancel» had to be typed too. */
export function declinedReminder(text: string): boolean {
  if (/[?？]|(나요|까요|가요|을까|ㄹ까)\s*[.!~]*\s*$/.test(text)) return false;
  return /(예약|알림)(은|도|은요)?\s*(하지\s*않|안\s*(해|하|걸)|필요\s*없|빼\s*(줘|주세요))/.test(text)
    || /\b(no need for (a |the )?(reminder|alert)s?|(don't|do not) (need|want|set) (a |the |any )?(reminder|alert)s?|no (reminder|alert)s? needed|skip the (reminder|alert)s?)\b/i.test(text)
    || DECLINE_ANY.test(text);
}

/** Pulls reminder blocks (and the stop mark) out of an answer. */
export function extractReminders(text: string): { proposals: ReminderProposal[]; stop: boolean; quiet: boolean; content: string } {
  const proposals: ReminderProposal[] = [];
  let content = text.replace(REMIND_RE, (_a, kind: string, spec: string, forSpec: string | undefined, body: string) => {
    // First line «title: …» / «제목: …» = the name the member sees in the list and on the phone notification (night test
    // 2026-09-30 round 8: without it the name was the AI's own instruction, «Remind the user to check… Do not claim…»).
    const t = /^\s*(?:title|제목)\s*[:：]\s*(.+)\n/i.exec(body);
    const prompt = (t ? body.slice(t[0].length) : body).trim();
    if (prompt) proposals.push({ kind: kind as ReminderKind, spec, forSpec: forSpec ?? null, prompt: prompt.slice(0, 2000), ...(t ? { title: t[1]!.trim().slice(0, 60) } : {}) });
    return "";
  });
  const stop = STOP_RE.test(content); STOP_RE.lastIndex = 0;
  const quiet = QUIET_RE.test(content); QUIET_RE.lastIndex = 0;
  content = content.replace(STOP_RE, "").replace(QUIET_RE, "").replace(/\n{3,}/g, "\n\n").trim();
  return { proposals, stop, quiet, content };
}

/** Checks a proposal. Returns a reason when it can't be used. */
/** The name shown to the member: the block's title line, or the task's first sentence (never the AI's instruction wording). */
export function reminderTitle(p: ReminderProposal): string {
  if (p.title) return p.title;
  const first = p.prompt.replace(/\s+/g, " ").split(/(?<=[.!?。])\s/)[0] ?? p.prompt;
  return first.slice(0, 60);
}

export function checkSpec(p: ReminderProposal): string | null {
  if (p.kind === "daily") { const m = /^(\d{1,2}):(\d{2})$/.exec(p.spec); if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return `bad time ${p.spec}`; }
  else if (p.kind === "days") { const m = /^([0-6]{1,7})@(\d{1,2}):(\d{2})$/.exec(p.spec); if (!m || Number(m[2]) > 23 || Number(m[3]) > 59) return `bad days ${p.spec}`; }
  else if (p.kind === "monthly" || p.kind === "yearly") { if (!calendar(calSchedule(p))) return p.kind === "monthly" ? `bad monthly day/time ${p.spec} (form 15T10:00)` : `bad yearly date/time ${p.spec} (form 02-15T10:00)`; }
  else if (p.kind === "at") { if (!/^(\d{4}-\d{2}-\d{2}T)?\d{1,2}:\d{2}$/.test(p.spec)) return `bad time ${p.spec}`; }
  else { const ms = durMs(p.spec); if (ms === null) return `bad interval ${p.spec}`; if (ms < 60_000) return "interval must be ≥ 1 minute"; if (ms > 30 * DAY) return "interval must be ≤ 30 days"; }
  if (p.forSpec) { const f = durMs(p.forSpec); if (f === null) return `bad duration ${p.forSpec}`; if (f > (p.kind === "monthly" || p.kind === "yearly" ? 3650 : p.kind === "daily" || p.kind === "days" ? 365 : 30) * DAY) return "too long"; }
  return null;
}

/** A daily/weekday reminder set again in the same chat at the same time replaces the one running there instead of adding a
 *  second (AI Soul 2026-10-01: re-asking «daily 04:30 … keep going» nearly ran the night review twice). Repeats and one-offs still add. */
/** A reminder at the same time that watches a value («tell me when it crosses X») keeps running when the new one is a different
 *  task — the new one is added beside it instead of overwriting it (AI Soul 7ad11ef). Same task text still replaces. */
export function keepsWatch(oldArgs: unknown, newPrompt: string): boolean {
  const a = (typeof oldArgs === "string" ? (() => { try { return JSON.parse(oldArgs) as unknown; } catch { return null; } })() : oldArgs) as { watch?: unknown; prompt?: unknown } | null;
  return !!a?.watch && String(a.prompt ?? "").trim() !== newPrompt.trim();
}
export function replacesSame(p: Pick<ReminderProposal, "kind">): boolean { return p.kind === "daily" || p.kind === "days" || p.kind === "monthly" || p.kind === "yearly"; }

/** «15T10:00» (monthly) / «2-15T10:00» (yearly) → the schedule string lib/schedule.ts reads («monthly@15@10:00», «yearly@02-15@10:00»). */
function calSchedule(p: Pick<ReminderProposal, "kind" | "spec">): string {
  const m = /^(?:(\d{1,2})-)?(\d{1,2})T(\d{1,2}):(\d{2})$/.exec(p.spec);
  if (!m || (p.kind === "yearly") !== Boolean(m[1])) return "";
  const two = (x: string) => x.padStart(2, "0");
  return p.kind === "yearly" ? `yearly@${two(m[1]!)}-${two(m[2]!)}@${two(m[3]!)}:${m[4]}` : `monthly@${two(m[2]!)}@${two(m[3]!)}:${m[4]}`;
}

/** «old» → prefix for the note when a same-time reminder was replaced with a different job (empty when the job is the same). */
export function replacedFrom(oldTitle: string, newTitle: string): string { return oldTitle && oldTitle !== newTitle ? `«${oldTitle}» → ` : ""; }

/** Automation schedule string for a proposal (see lib/schedule.ts). `at` resolves to an absolute instant in the user's zone. */
export function toSchedule(p: ReminderProposal, tz: string, now = new Date()): { schedule: string; first: Date; endsAt: Date } {
  // Unchore: a member's «every day»/«weekdays» reminder keeps going until they say stop — no silent end after 7 days
  // (AI Soul's 7-day default is for its one owner; night test 2026-09-30: «매일 아침 8시 혈압약» would have stopped after a week).
  if (p.kind === "daily" || p.kind === "days") {
    const [d, t] = p.kind === "days" ? p.spec.split("@") : [null, p.spec];
    const [h, m] = t!.split(":");
    const hm = `${h!.padStart(2, "0")}:${m}`;
    const schedule = d ? `days@${[...new Set(d)].sort().join("")}@${hm}` : `daily@${hm}`;
    return { schedule, first: new Date(0), endsAt: new Date(now.getTime() + (p.forSpec ? durMs(p.forSpec)! : 365 * DAY)) };
  }
  // Monthly and yearly: filings, renewals, rent — they keep going 3 and 10 years unless for= says otherwise (AI Soul 1d05cf6).
  if (p.kind === "monthly" || p.kind === "yearly") {
    return { schedule: calSchedule(p), first: new Date(0), endsAt: new Date(now.getTime() + (p.forSpec ? durMs(p.forSpec)! : (p.kind === "monthly" ? 3 : 10) * 365 * DAY)) };
  }
  if (p.kind === "every") {
    const ms = durMs(p.spec)!;
    return { schedule: `every:${Math.round(ms / 60_000)}m`, first: new Date(now.getTime() + ms), endsAt: new Date(now.getTime() + (p.forSpec ? durMs(p.forSpec)! : DAY)) };
  }
  const at = p.kind === "after" ? new Date(now.getTime() + durMs(p.spec)!) : atInstant(p.spec, tz, now);
  return { schedule: `once@${at.toISOString()}`, first: at, endsAt: new Date(at.getTime() + 60_000) };
}

/** «10:00» = next 10:00 in the user's zone; «2026-10-01T10:00» = that wall-clock time in the user's zone. */
export function atInstant(spec: string, tz: string, now = new Date()): Date {
  const full = /^(\d{4})-(\d{2})-(\d{2})T(\d{1,2}):(\d{2})$/.exec(spec);
  const p = (d: Date): Record<string, string> => Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(d).map((x) => [x.type, x.value]));
  const offset = (d: Date) => { const q = p(d); return Date.UTC(+q.year!, +q.month! - 1, +q.day!, +q.hour! % 24, +q.minute!) - Math.floor(d.getTime() / 60_000) * 60_000; };
  const wall = (y: number, mo: number, d: number, h: number, mi: number) => { const g = Date.UTC(y, mo - 1, d, h, mi); return new Date(g - offset(new Date(g - offset(new Date(g))))); };
  if (full) return wall(+full[1]!, +full[2]!, +full[3]!, +full[4]!, +full[5]!);
  const [h, mi] = spec.split(":").map(Number) as [number, number];
  const q = p(now);
  let t = wall(+q.year!, +q.month!, +q.day!, h, mi);
  if (t <= now) t = new Date(t.getTime() + DAY);
  return t;
}

export function remindersGuide(): string {
  return [
    "## Reminders (timed instructions)",
    "Only when the user's own message sets a time («every 5 minutes», «in 30 minutes», «every day at 9», «at 10:00») — or asks to be told when a value crosses a number they give («tell me when it goes over 1,400»; use every=1h, or daily if they said daily) — add this block at the very end of your answer. The app schedules it and asks you again at that time in this same chat:",
    "<<<remind every=5m for=3h>>>",
    "title: (2–5 words the user will see, in their language — e.g. «혈압약 알림», «Client follow-ups»)",
    "(what to do at that time — what to check and what to tell the user)",
    "<<<end>>>",
    "Kinds: every=5m / every=2h (repeat) · after=30m (once) · at=10:00 or at=2026-10-01T10:00 (once, user's time zone) · daily=09:00 · days=12345@09:00 (on those weekdays, 0=Sun … 6=Sat: weekdays 12345, every Monday 1) · monthly=15T10:00 (that day each month; 31 = the month's last day) · yearly=02-15T10:00 (that date every year — a yearly filing or renewal is yearly=, not a daily check). Optional for=3h/7d = when to stop (default 1 day; daily and days keep going until the user says stop, monthly 3 years, yearly 10 years).",
    "Messages that start with «⏰ Reminder» were started by a reminder: do the task and report briefly. When there is nothing left to watch, put <<<remind-stop>>> on the last line to end it.",
    "On such a run, if there is nothing worth telling this time (a price or rate line not crossed, nothing new), answer with only <<<quiet>>> — the app stays silent and the reminder keeps going. For a «tell me when it crosses X» reminder, prefer every=1h or daily over every few minutes.",
    // Goal reminders (AI Soul build-log «goals» 2026-10-02: «set a high target; when it is missed, search the web and change one thing every day until it is met»)
    "If the user gives a number goal and wants it improved every day until it is met («1,000 views per post — if it misses, find a way and improve it every day»), add a line «goal: <what is measured> <target>» right under title: — the app then runs it as a goal reminder: each run you measure, and when the goal is missed you search the web for one method not tried before and record it. Only for something the member raises by their own work (views, sales, steps) — never for a price, rate or other value they only watch.",
    // Night 2026-10-03: «tell me when the lowest price drops» had no number, so the app couldn't read it itself and asked the AI every hour for 30 days.
    "For «tell me when a price/rate crosses X», write the line plainly in the task («…below 82,000 USD», «…lowest price below 218,990 KRW») — the app reads the value itself each run and asks you only once it is crossed. If they gave no number («when it drops», «when it goes up»), use the current value you read as the line.",
    "Never write the block unless the user asked for a time. Never claim a reminder is set — the app confirms it under your answer.",
    "Only set a reminder the app can really do at that time: a fixed message, a piece of writing, or a live value it can read (exchange rates, coin prices, weather, news, Danawa and Korean stock prices — a Danawa price needs only the product name, no link). If a date or detail is missing, ask for it once; if they ask again to switch it on, set the most useful version now with what you have — never refuse twice.",
    // Night 2026-10-01 round 13: with a time the AI chose itself, the answer said «하실 일은 없어요» while the app showed «Yes, switch it on — daily 09:00» (not on yet).
    // Round 15: said too widely, the AI stopped asking for the time and set its own («every morning» → 08:00 at once, the member's 7:00 never asked) — so only in the «asked again» case.
    "When they ask again and you set it with a time you chose yourself, end with one short line asking them to confirm that time with the button below — never say it is set or that nothing is left to do. The first time a time is missing, ask for it (a pick with a few times is best).",
  ].join("\n");
}

/** Goal reminder (AI Soul build-log «goals», 2026-10-02): the reminder text carries «goal: …». */
export const GOAL_RE = /^goal:\s*(.+)$/im;
/** The method the AI tried this run — «Tried: <method> | <source link>» (one line). */
export const TRIED_RE = /^Tried:\s*(.+?)\s*\|\s*(https?:\/\/\S+)\s*$/im;
export type Tried = { at: string; what: string; src: string };
export function goalOf(prompt: string): string | null { return GOAL_RE.exec(prompt)?.[1]?.trim().slice(0, 200) || null; }
/** The goal of a reminder run — none when the app watches a price line itself (args.watch): that value is only watched, not raised (night 2026-10-03). */
export function goalFor(prompt: string, watched: boolean): string | null { return watched ? null : goalOf(prompt); }
export function triedOf(answer: string, at: string): Tried | null {
  const m = TRIED_RE.exec(answer);
  return m ? { at, what: m[1]!.slice(0, 200), src: m[2]!.slice(0, 300) } : null;
}
/** Same method again? (compared without case/spaces — «Again:» in front means a deliberate second try) */
export function triedBefore(list: Tried[], t: Tried): boolean {
  const k = (x: string) => x.toLowerCase().replace(/\s+/g, "");
  return !/^again:/i.test(t.what) && list.some((x) => k(x.what) === k(t.what));
}
