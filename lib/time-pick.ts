// «No time given» → one tap (night 2026-10-01 round 8): «Yes, switch it on — <when>» / «A different time».
// The tap is our own words, so it is recognised exactly in every language — the time-ask patterns missed
// «はい、オンにする — 平日の07:30» and «Ja, einschalten – jeden Mo um 08:30», so the loop never closed.
import { trFor } from "./i18n-server";
import { exactRe, wordsRe } from "./words";
import W_YES from "./words/yes_short.json";
import W_ASK from "./words/remind_ask.json";

const KEY = "Yes, switch it on — {when}";
export const timePickLabel = (lang: string, when: string): string => trFor(lang)(KEY, { when });

/** Is this message the member tapping that pick (in their language)? */
export function tappedTimePick(text: string, lang: string): boolean {
  const [head = "", tail = ""] = trFor(lang)(KEY, { when: "\u0000" }).split("\u0000");
  const t = text.trim();
  return (head.trim() !== "" || tail.trim() !== "") && t.startsWith(head.trim()) && t.endsWith(tail.trim()) && /\d{1,2}:\d{2}/.test(t);
}

// Night 2026-10-01 round 12: with that pick on screen, a member typed «좋아요, 그거 지금 켜 주세요» five times and nothing switched on
// (the typed words name no time). The pick showed the time, so a plain «turn it on / yes» right after it agrees to that time.
const TURN_ON = /켜\s*(줘|주세요|주실|줄래)|\b(turn|switch|set) (it |that |this )?(on|up)\b|\b(yes|yeah|ok(ay)?|sure|sounds good|do it|go ahead)\b|^(네|예|응|좋아요|그래요|진행해)[.!~\s]*$/i;
const YES_ANY = exactRe(W_YES), ASK_ANY = wordsRe(W_ASK);
/** The member agrees to the time the previous answer offered as a pick (tapped it, or typed «yes / turn it on»). */
export function agreesToOffered(text: string, prevAnswer: string, lang: string, when: string): boolean {
  if (!prevAnswer.includes(timePickLabel(lang, when))) return false;
  const t = text.trim();
  return tappedTimePick(t, lang) || TURN_ON.test(t) || YES_ANY.test(t) || ASK_ANY.test(t);
}
