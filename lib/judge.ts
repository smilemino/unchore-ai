import type { Lang } from "./i18n";
import { langInfo } from "@/lib/i18n";
import { complete, firstJson } from "./ai";
import { wordsRe, wordsSrc } from "./words";
import W_EXAMPLE from "./words/example_word.json";
import W_SEND from "./words/send_detail_ask.json";

// «Should I offer to automate this?» — rules v3 (overnight test 2026-09-29: Sonnet 95%, Haiku 90%, 0–3 needless offers in 60).
export const JUDGE_RULES = `You are a personal AI assistant. The user asked something and you already answered.
Decide whether to OFFER to do this «automatically from now on». Offer only for:
- things that repeat (daily / weekly / monthly),
- values that change and need watching (prices, lowest price, exchange rate, stock, weather, listings, job posts, news, delivery, law changes),
- deadlines that must not be missed (renewals, pills, filing dates, maintenance cycles),
- ongoing routines the user asked help with once but must keep doing (meal plan, study, workout, spending, subscriptions).
Do NOT offer for one-off explanations, opinions, emotional talk, relationship advice, or one-time writing/translation — it becomes nagging.
Method (one): A = public data/API, B = connect the user's account (mail, calendar, card SMS), C = read a web page with a browser (no API), D = a small scheduled program (reminder or AI-written brief), X = no automation.
Examples:
- "gold price today?" → yes, A, "Want the gold price every morning?"
- "cheapest Galaxy Buds?" → yes, C, "Shall I tell you the moment the lowest price drops?"
- "what to eat when I have a cold?" → no, X
- "write a wedding toast" → no, X
- "when should I change my tires?" → yes, D, "Want a reminder when they're due by mileage?"
- "plan this week's workouts" → yes, D, "Shall I send today's workout every morning?"
Reply with ONE JSON line only: {"propose":"yes|no","method":"A|B|C|D|X","offer":"<short offer in the user's language, empty if no>"}`;

export type Judgement = { propose: boolean; method: "A" | "B" | "C" | "D" | "X"; offer: string };

// Every other language (lib/words): «例：», «z. B.»; «リンクを送ってください», «schick mir den Link».
const EXAMPLE_ANY = new RegExp(`^\\(?\\s*(?:${wordsSrc(W_EXAMPLE, false)})`, "iu"), SEND_ANY = wordsRe(W_SEND);

/** The answer is still asking the user something (a pick block, or it ends on a question) → no switch-on card yet.
 *  Night test 2026-09-30: 10 of 10 new members got the card on the very turn Unchore asked «what time?», tapped yes,
 *  and the automation was built on defaults (08:00, no price line) — the answer they were about to give was lost. */
const HOW_TO_ANSWER = /예를 들어|예시|예\s*[:：]|(이?라고|처럼)\s*(답|말씀|적어|보내)|답해\s*주|\b(for example|e\.g\.|reply (with|like)|just (say|reply|type)|answer with)\b/i;
export function asksBack(answer: string): boolean {
  if (/<<<pick>>>/.test(answer)) return true;
  // Night 2026-10-01: «비트코인이 얼마 아래로…» asked inside a decide box (the fence closes the answer) → the card still came and
  // built an empty «set the line» reminder. A decide box is always a question to the user.
  if (/```\s*decide\b/i.test(answer)) return true;
  const lines = answer.replace(/<<<[\s\S]*?>>>/g, "").trim().split("\n").map((l) => l.trim()).filter(Boolean);
  const endsAsking = (l: string) => /[?？؟]\s*[)"'”’*_]*$/.test(l);
  let last = lines.at(-1) ?? "";
  // Night test 2026-09-30 round 6: «…언제까지 내야 하나요? (예: 10월 3일 오후 11시 59분)» — an example after the question;
  // and «다나와 상품 링크를 보내주세요» — asking without a question mark. Both got a card that built an empty reminder.
  if ((/^(\(?\s*(예|예시|e\.g\.|for example|like)\b|\(?\s*예\s*[:：)]|“|")/i.test(last) || EXAMPLE_ANY.test(last)) && lines.length > 1) last = lines.at(-2)!;
  // Night 2026-10-01 round 4: «몇 원을 넘으면 알려드릴까요? 원하시면 확인 간격도 적어 주세요. 예: “1,400원, 매시간 확인”» — the example
  // sits on the question's own line, and a sentence follows the «?»; the card came first and built a rate alert with no line.
  const q = last.replace(/\s*\((예|e\.g\.)[^)]*\)\s*$/i, "").replace(/\s*(?:예|예시|e\.g\.|for example)\s*[:：]\s*.*$/i, "");
  if (endsAsking(q) || /[?？؟](?=\s)/.test(q)) return true;
  // Night 2026-10-01 round 10: «원·달러 환율이 얼마를 넘으면 알려드릴까요?» then a new line «기준은 … 예를 들어 1,400원을 넘을 때라면
  // 1,400원이라고 답해 주세요.» — the question is a line up and what follows only says how to answer; the card came and built a rate
  // alert with no line. A question one or two lines from the end, followed only by how-to-answer lines, is still asking.
  for (let i = lines.length - 2; i >= Math.max(0, lines.length - 3); i--) {
    if (!(endsAsking(lines[i]!) || /[?？؟](?=\s)/.test(lines[i]!))) continue;
    if (lines.slice(i + 1).every((l) => HOW_TO_ANSWER.test(l) || EXAMPLE_ANY.test(l))) return true;
    break;
  }
  const tail = lines.slice(-2).join(" ");
  return /(링크|주소|날짜|시간|시각|이름|번호|가격|금액|상품명|모델명|기준|환율)[^.!\n]{0,24}(보내|알려|적어|말씀해|정해)\s*주(세요|시면|실래요)/.test(tail)
    || /\b(send|tell|give|paste) me (the|your) (link|url|date|time|name|price|model)\b/i.test(tail) || SEND_ANY.test(tail);
}

export async function judge(o: { model: string; key: string; question: string; answer: string; lang: Lang }): Promise<Judgement> {
  const text = await complete({
    model: o.model, key: o.key, maxTokens: 200, system: JUDGE_RULES,
    messages: [{ role: "user", content: `User language: ${langInfo(o.lang).en}\n\nQuestion:\n${o.question.slice(0, 2000)}\n\nYour answer (summary):\n${o.answer.slice(0, 1500)}` }],
  });
  const j = firstJson<{ propose?: string; method?: string; offer?: string }>(text);
  const propose = /^(yes|예|y|true)$/i.test(String(j?.propose ?? "no").trim());
  const method = (["A", "B", "C", "D", "X"].includes(String(j?.method)) ? j!.method : "X") as Judgement["method"];
  return { propose: propose && method !== "X", method, offer: propose ? String(j?.offer ?? "").slice(0, 200) : "" };
}
