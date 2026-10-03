import { asksBack } from "./judge";
import { exactRe, wordsRe } from "./words";
import W_OFFER from "./words/offer_ask.json";
import W_USER_DONE from "./words/user_done.json";
import W_DONE_ORDER from "./words/done_order.json";
import W_WITHDRAWN from "./words/ask_withdrawn.json";

const OFFER_ANY = wordsRe(W_OFFER);   // every other language (lib/words)
import { complete, providerOf, type Provider } from "./ai";

// «Your turn» and «done» marks (ported from AI Soul lib/conv-mark.ts + lib/ask-judge.ts):
// · the AI ends a finished task with a line [done] → the chat is marked done (the line never shows);
// · an answer that waits for the member (a question, a pick, «send me the link») → 🟠 your turn, first screen line and app icon number.
// The rule decides clear cases; the member's own small AI is asked only when the end of the answer hints at a question and they left ask_judge on.

const DONE_LINE = /^\s*\[(done|완료)\]\s*$/i;

/** Takes a [done] line out of the last three lines. */
export function readDoneMark(text: string): { text: string; done: boolean } {
  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 3); i--) {
    if (DONE_LINE.test(lines[i]!)) { lines.splice(i, 1); return { text: lines.join("\n").replace(/\s+$/, ""), done: true }; }
  }
  return { text, done: false };
}

// The member says «done» (AI Soul lib/conv-mark.ts userSaysDone · 9/26 owner «I typed 완료 and it didn't close») — a short line only;
// «don't finish», questions and «show me what's done» are not. The answer then closes the chat unless it asks or says work is left.
const USER_DONE_EN = /^(?:(?:this|the)\s+(?:task|chat|one)\s+(?:is\s+)?)?(?:done|finished|all\s+done|that'?s\s+(?:all|it)|we'?re\s+done|close\s+(?:it|this)|mark\s+(?:it|this)\s+(?:as\s+)?done)(?:\s+(?:now|please|thanks?|thank\s+you))?$/i;
const USER_DONE_KO = /^(?:이\s*(?:일|건|대화|채팅)창?(?:은|는)?\s*)?(?:완료|끝|끝났|끝냈|마무리|다\s*됐|다\s*했|종료)[\s\S]{0,12}$|(?:완료|끝)\s*(?:으로|로)?\s*(?:표시|처리|체크)\s*(?:해|하|좀|부탁)/;
const USER_NOT_DONE = /\b(?:not|don'?t|never|yet|show|tell|check|list)\b|하지\s*마|말고|말아|않|안\s*(?:돼|됐|했|끝)|못\s|아직|(?:나요|니|냐|는지|은지|인지|을까|까요|가요|죠|지요)$|알려|보여|말해|찾아|확인|것만|거만|된\s*것|된\s*거|[「」『』"“”]/i;
const USER_DONE_ANY = exactRe(W_USER_DONE);   // every other language (lib/words)
export function userSaysDone(text: string | null | undefined): boolean {
  const t = String(text ?? "").trim().replace(/[.!~。]+$/, "");
  if (!t || t.length > 30 || /[?？]/.test(t) || USER_NOT_DONE.test(t)) return false;
  return USER_DONE_EN.test(t) || USER_DONE_KO.test(t) || USER_DONE_ANY.test(t);
}
// A longer message (with a question or a complaint in it) that still tells us to close: «완료 된 것 아닌가요? 완료 처리해주세요»
// (AI Soul worker/done-gate.ts ownerOrdersDone · 2026-10-02 owner asked three times and nothing closed). Sentence by sentence;
// quoted words (someone else's message passed on), «don't», «not yet», «cancel» and «라고» (reported speech) don't count.
const DONE_ORDER_KO = /(?:완료|끝)\s*(?:으로|로)?\s*(?:표시|처리|체크)\s*(?:해\s*(?:주|줘|도)|하(?:세요|셔도)|좀|부탁)|완료\s*해\s*(?:주세요|줘|도\s*(?:돼|됩니다))/;
const DONE_ORDER_EN = /\b(?:please\s+)?mark\s+(?:it|this|the\s+(?:chat|task))\s+(?:as\s+)?(?:done|complete)\b|\byou\s+can\s+close\s+(?:it|this|the\s+chat)\b/i;
const DONE_ORDER_NOT = /\b(?:don'?t|do not|not yet|never|later|cancel)\b|하지\s*마|말고|말아|아직|않|취소|번복|보류|라고|이라고|라는|라며/i;
const DONE_ORDER_ANY = wordsRe(W_DONE_ORDER);   // every other language (lib/words)
export function userOrdersDone(text: string | null | undefined): boolean {
  const t = String(text ?? "").slice(0, 1000).replace(/(["“”'‘’「『«])[^"“”'‘’「」『』«»\n]*?(["“”'‘’」』»])/g, " ");
  return t.split(/[.!?？。\n]+/).some((s) => (DONE_ORDER_KO.test(s) || DONE_ORDER_EN.test(s) || DONE_ORDER_ANY.test(s)) && !DONE_ORDER_NOT.test(s));
}
/** The answer says something is still left or failed — then «done» from the member is a request the AI turned down. */
const REMAIN_SAID = /\b(?:not yet|still (?:running|waiting|left|working)|in progress|couldn'?t|could not|failed|remaining)\b|아직|남아\s*있|남았|남은\s*(?:일|것|게)|못\s*(?:했|합|끝|하)|하지\s*못|도는\s*중|진행\s*중|기다리는\s*중|실패/i;
export function doneByUserAsk(user: string | null | undefined, answer: string): boolean {
  return (userSaysDone(user) || userOrdersDone(user)) && !REMAIN_SAID.test(answer.slice(0, 2000));
}

/** How much of the answer's end is looked at — the hint and the small AI see the same part. 400 missed a question asked mid-answer
 *  and followed by a report or «I'll get back to you» (AI Soul lib/ask-judge.ts · 2,500). */
export const ASK_TAIL = 2500;

/** Anything question-like near the end — worth a closer look. No hint → certainly not waiting. */
export function mayAsk(text: string): boolean {
  if (asksBack(text)) return true;
  const tail = text.replace(/```[\s\S]*?```/g, "").slice(-ASK_TAIL);
  return /[?？؟]|<<<pick>>>|\b(yes or no|shall I|should I|would you like|do you want)\b|할까요|드릴까요|주세요|알려 ?주/i.test(tail) || OFFER_ANY.test(tail);
}

const JUDGE = `You read the end of an assistant's answer. Is the assistant now WAITING for the user — a question the user must answer, a choice to make, something to send or confirm — before it can go on?
The question may sit in the middle, followed by a report or a closing line such as «I'll let you know when it's done» — that is still waiting.
A rhetorical question, an offer made in passing that needs no reply, or «let me know if…» is NOT waiting.
Reply with one word: yes or no.`;

/** The answer's end as the small AI sees it — «…» marks a cut start. */
export function judgeInput(answer: string): string {
  const a = answer.trim();
  return a.length > ASK_TAIL ? `…${a.slice(-ASK_TAIL)}` : a;
}

/** true/false; null when the AI couldn't say (the rule decides then). */
export async function judgeAsks(answer: string, model: string, key: string): Promise<boolean | null> {
  try {
    const r = await complete({ model, key, maxTokens: 5, system: JUDGE, messages: [{ role: "user", content: judgeInput(answer) }] });
    const w = r.trim().toLowerCase();
    return w.startsWith("yes") ? true : w.startsWith("no") ? false : null;
  } catch { return null; }
}

/** A «decide» box (Markdown.tsx BOX.decide) is the member's decision by definition — it waits for them even when the question sits
 *  only inside the box (mayAsk drops fenced blocks) or a «still waiting for…» line follows (AI Soul 9/30 9d8b916). */
const DECIDE_BOX = /```[ \t]*(decide|decision|결정)[ \t]*\n[\s\S]*?\S[\s\S]*?```/i;
export function hasDecisionBox(text: string): boolean { return DECIDE_BOX.test(text); }

/** A reminder's answer lands after a question the member hasn't answered yet: that question still waits for them (AI Soul
 *  lib/open-decision.ts · cc0ed68 — a decision box was buried under the next reminder's answer and the chat lost «your turn»).
 *  `rows` newest first, without the new answer: earlier answers that asked → still open; a message the member wrote → answered.
 *  Reminder prompts are stored as user messages that start with ⏰ (lib/automation.ts) — those are not the member. */
// The answer takes the earlier question back or says there's nothing for the member to do (AI Soul lib/open-decision.ts aiWithdrew ·
// 2895875 — a call chat stayed «your turn» after the AI wrote «nothing for you to do», and the owner had to type «mark it done»).
const WITHDRAWN = /\bnothing (?:for you to|you need to) (?:do|decide)|\bno need (?:for you )?to (?:decide|answer|reply)|\bi won'?t ask (?:again|further)|(?:하실|정하실|답하실)\s*(?:일|것|게)\s*[:：]?\s*[이가은는도]?\s*없|더\s*(?:는\s*)?여쭙지\s*않|정하실\s*필요[가는]?\s*없|여쭐\s*(?:것|게|일)[이가은는도]?\s*없|다르면\s*(?:한\s*마디|말씀)\s*만|\b(?:just )?let me know if (?:you(?:'d)? (?:want|like) (?:it )?)?(?:anything )?different/i;   // «다르면 말씀만» = 해 두고 알림(AI Soul 6b2ff82 · 10/2)
const WITHDRAWN_ANY = wordsRe(W_WITHDRAWN);   // every other language (lib/words)
export function aiWithdrew(text: string): boolean { return WITHDRAWN.test(text) || WITHDRAWN_ANY.test(text); }
/** A reminder's answer still leaves the earlier question open — unless it takes it back in words, or marks the task done
 *  ([done] is a signal that survives new wording · AI Soul 93028744 open-decision done_mark). */
export function reminderKeepsAsk(text: string, done: boolean): boolean { return !done && !aiWithdrew(text); }

export function openAsk(rows: { role: string; text: string; asks: boolean | null }[]): boolean {
  for (const r of rows) {
    if (r.role === "assistant") { if (r.asks) return true; continue; }
    if (!r.text.trimStart().startsWith("\u23F0")) return false;
  }
  return false;
}

/** The question itself, short: a decide box's inside, else the answer's last paragraph. */
function askText(text: string): string {
  const box = DECIDE_BOX.exec(text)?.[0].replace(/^[^\n]*\n/, "").replace(/```$/, "");
  const t = (box ?? text.replace(/```[\s\S]*?```/g, "").trim().split(/\n\s*\n/).at(-1) ?? "").replace(/\s+/g, " ").trim();
  return t.length > 200 ? `…${t.slice(-200)}` : t;
}

/** A line for the member's next turn when a question they haven't answered sits under reminder answers (AI Soul lib/open-decision.ts
 *  openDecisionNote · 6219ecf — «is there anything I need to answer?» got «done» because the AI didn't see the buried decision).
 *  `rows` newest first, without the member's new message; same chain as openAsk, and the chat still shows «your turn». */
export function openAskNote(rows: { role: string; text: string; asks: boolean | null }[]): string | null {
  let ask: string | null = null, reminderSeen = false, buried = false;
  for (const r of rows) {
    if (r.role === "assistant") { if (r.asks !== true) break; ask = r.text; buried = reminderSeen; continue; }
    if (!r.text.trimStart().startsWith("\u23F0")) break;
    reminderSeen = true;
  }
  const q = ask && buried ? askText(ask) : "";
  return q ? `(System: a question in this chat still waits for their answer — «${q}». Reminder messages came after it, so it is easy to miss. If they ask whether anything is waiting for them, or say «done», first say this question is still open and ask it again. If they move on, answer elsewhere or say to drop it, follow them.)` : null;
}

/** Waiting for the member? Rule first; the small AI only for the unclear ones. */
export async function answerAsks(answer: string, o: { judge: boolean; model: string | null; keys: Partial<Record<Provider, string>> }): Promise<boolean> {
  if (hasDecisionBox(answer)) return true;
  if (!mayAsk(answer)) return false;
  if (o.judge && o.model && o.keys[providerOf(o.model)]) {
    const j = await judgeAsks(answer, o.model, o.keys[providerOf(o.model)]!);
    if (j !== null) return j;
  }
  return asksBack(answer);
}
