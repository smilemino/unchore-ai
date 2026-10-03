import { q } from "./db";
import { unlock } from "./privacy";
import { wordsRe } from "./words";
import W_CONFUSED from "./words/confused.json";
import W_NOT_RIGHT from "./words/not_right.json";

// Nightly look-back (ported from AI Soul lib/nightly-review.ts): reads only the improvement copies members agreed to
// («Help improve Unchore» — names, e-mail, phone, card, ID, account and address already removed, no link to the member),
// and picks yesterday's answers that went wrong: the next message asked for plainer words, said it was wrong, or the answer failed.
// Served to our own nightly improvement run (/api/cron/review, cron secret) — never to members, never outside.
export type Signal = "plain" | "fix" | "error";
const PLAIN = /쉽게|무슨 말|이해가 안|모르겠|어려워|simpler|plain(er)? (words|english)|what do you mean|don'?t understand|too technical|eli5/i;
const FIX = /그게 아니|아직(도)? 안|안 되는데|틀렸|잘못|다시 해|not what i|still (not|doesn'?t|isn'?t)|doesn'?t work|that'?s wrong|you'?re wrong|try again/i;

const PLAIN_ANY = wordsRe(W_CONFUSED), FIX_ANY = wordsRe(W_NOT_RIGHT);   // every other language (lib/words)

/** Why an answer counts as «went wrong», from the next message in the same chat (or its own failure). */
export function signalOf(ok: boolean | null, next: string | null): Signal | null {
  if (ok === false) return "error";
  if (!next || next.length > 400) return null;
  if (PLAIN.test(next) || PLAIN_ANY.test(next)) return "plain";
  if (FIX.test(next) || FIX_ANY.test(next)) return "fix";
  return null;
}

type Row = { id: number; thread: string; lang: string | null; model: string | null; question: string; answer: string; ok: boolean | null; created_at: string };
export type Review = { from: string; to: string; total: number; signals: Record<Signal, number>; byModel: Record<string, { n: number; bad: number }>; cases: Array<{ signal: Signal | null; lang: string | null; model: string | null; question: string; answer: string; next: string | null }> };

/** all — also return the answers with no signal (in chat order, capped), for our 30-minute «stay in the chat» check (2026-10-01 owner),
 *  which looks for answers that send people to other screens. Still only the agreed, de-identified improvement copies. */
export async function nightlyReview(hours = 24, maxCases = 60, all = false): Promise<Review> {
  const rows = (await q<Row>("select id, thread, lang, model, question, answer, ok, created_at from improve_samples where created_at > now() - ($1 || ' hours')::interval order by thread, created_at", [String(hours)]))
    .map((r) => ({ ...r, question: unlock(r.question), answer: unlock(r.answer) }));
  const out: Review = { from: rows[0]?.created_at ?? "", to: rows.at(-1)?.created_at ?? "", total: rows.length, signals: { plain: 0, fix: 0, error: 0 }, byModel: {}, cases: [] };
  rows.forEach((r, i) => {
    const next = rows[i + 1]?.thread === r.thread ? rows[i + 1]!.question : null;
    const s = signalOf(r.ok, next);
    const m = (out.byModel[r.model ?? "?"] ??= { n: 0, bad: 0 });
    m.n++;
    if (!s) { if (all && out.cases.length < maxCases) out.cases.push({ signal: null, lang: r.lang, model: r.model, question: r.question.slice(0, 800), answer: r.answer.slice(0, 1500), next: next?.slice(0, 300) ?? null }); return; }
    m.bad++; out.signals[s]++;
    if (out.cases.length < maxCases) out.cases.push({ signal: s, lang: r.lang, model: r.model, question: r.question.slice(0, 1500), answer: r.answer.slice(0, 2500), next: next?.slice(0, 500) ?? null });
  });
  return out;
}
