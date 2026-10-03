// The app speaks first (ported from AI Soul lib/app-talk.ts): when work a member left running finishes — an answer, a computer's
// job, a built app — the Android app (InboxJob) shows the notice and, if the phone isn't on silent / vibrate / do-not-disturb
// or in a call, reads it aloud. Here only the line to read (a pure function); /api/push/app adds it to fresh notices.

export const APP_TALK_FRESH_MS = 10 * 60_000;   // older notices are only shown, never read — a phone coming back online doesn't read out old news
const TALK_TAGS = [/^unchore-answer-/, /^unchore-computer-/, /^build$/];   // «your work is done» notices (lib/push.ts callers)

/** The line the phone reads for a notice, or null when it shouldn't be read (not a «done» notice, or older than 10 minutes). */
export function talkSay(n: { title: string; body: string; tag: string | null; ageMs: number }): string | null {
  if (!n.tag || !TALK_TAGS.some((t) => t.test(n.tag!)) || !(n.ageMs >= 0 && n.ageMs < APP_TALK_FRESH_MS)) return null;
  const clean = (s: string) => s.replace(/[«»✓✔⏰☀]/g, "").replace(/…$/, "").replace(/\s+/g, " ").trim();
  const t = n.title === "Unchore" ? "" : clean(n.title), b = clean(n.body);
  return [t, b].filter(Boolean).join(". ").slice(0, 300) || null;
}
