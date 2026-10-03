import { k, langInfo, type TFn } from "./i18n";
import { FOUNDER_PICKS } from "./recipe-titles";
// Five faces, one product (plan 10판 §5 · 2026-09-29 owner: «everyone gets their own wow»).
// The first chat opens with Unchore speaking first and six picks; the pick (or the first words) tells us who this is,
// and that sets the tone and the first three ideas. Wrong guess → the user says so, or changes it in Settings.

export const FACES = ["student", "worker", "shop", "builder", "senior", "general"] as const;
export type Face = (typeof FACES)[number];

/** The six first-chat picks. `face` is what the pick tells us; «health & family» and «money» don't pin a face by themselves. */
/** `en` is also the translation key — the button shows t(en) in the screen's language. */
export const PICKS: { face: Face | null; en: string }[] = [
  { face: "student", en: k("Studying") },
  { face: "worker", en: k("Work at a company") },
  { face: "shop", en: k("Running a shop or business") },
  { face: "builder", en: k("Building things — code, startups") },
  { face: null, en: k("Health & family") },
  { face: null, en: k("Money & investing") },
  // «Tell me everything» (benchmark 2026-09-30: a founder's Saturday homework — write down every task, sort into four boxes,
  // automate the easy ones first). The AI takes it from here (WORK_DUMP_GUIDE).
  { face: null, en: k("Let me list all my work — sort it for me") },
];

// The first chat opens in two steps (owner 2026-09-30: «a bare "what do you do" gets skipped — say why first, then start with
// the easiest question, what to call you»). Step 1: why we ask + the name. Step 2 (no AI call in between): the six picks.
export function askName(t: TFn): string {
  return `${t("Nice to meet you — I'm Unchore. The better I know you, the more chores I can take off your plate.")}\n\n${t("First, what should I call you?")}`;
}

export function greeting(t: TFn, name = ""): string {
  return name ? t("Thanks, {name}! What keeps you busy these days? Tap one below, or just tell me.", { name })
    : t("What keeps you busy these days? Tap one below, or just tell me.");
}

/** Their answer to «what should I call you?» → the name alone («민호라고 불러 주세요» → 민호, «Call me Sam» → Sam).
 *  Korean drops a closing 님 (the greeting adds it). null = not a name (a sentence) — hand it to the AI instead.
 *  Korean and English are here; the other languages come in `other` (lib/face-words.ts callNameAny — server only). */
export function callName(text: string, lang: string, other?: RegExp): string | null {
  let n = text.trim().replace(/^["'«“]+|["'»”.!?~。！？]+$/g, "").trim();
  if (other) n = n.replace(other, " ").replace(/^[\s\p{P}]+|[\s\p{P}]+$/gu, "").replace(/\s{2,}/g, " ");   // the 56 other languages (lib/face-words.ts)
  n = n.replace(/^(?:call me|i'm|i am|my name is|it's|just)\s+/i, "").replace(/\s*,?\s*(?:please|pls)$/i, "")
    .replace(/^(?:저는|전|제 이름은|나는|난|그냥)\s*/, "")
    .replace(/\s*(?:(?:이?라고|으?로)\s*)?불러\s*(?:주세요|줘요|줘|주시면\s*돼요|주시면\s*됩니다|주면\s*돼)?$/, "")
    .replace(/(?:입니다|이에요|예요|이요)$/, "").trim();
  if (lang === "ko") n = n.replace(/\s*님$/, "").trim();
  n = n.replace(/[<>]/g, "");
  return n && n.length <= 24 && n.split(/\s+/).length <= 4 ? n : null;
}

const WORDS: [Face, RegExp][] = [
  ["builder", /\b(api|github|git|deploy|repo|typescript|python|docker|kubernetes|sdk|cli|startup|founder|saas|devops|llm|agent)\b|개발|코딩|코드|깃허브|배포|창업|스타트업/i],
  ["student", /\b(exam|homework|assignment|class(es)?|semester|university|college|school|thesis|midterm|finals?)\b|시험|과제|수업|학교|대학|학기|수능|논문|중간고사|기말/i],
  ["shop", /\b(my (shop|store|restaurant|cafe|salon)|customers?|reviews?|orders?|inventory|small business)\b|가게|매장|장사|손님|리뷰|주문|재고|식당|카페|미용실/i],
  ["senior", /\b(grandchild(ren)?|grandkids?|retired|retirement|pension|my (medication|pills))\b|손주|손자|손녀|은퇴|연금|약 먹|혈압|병원 예약|복용/i],
  ["worker", /\b(my boss|meeting|colleague|office|report|deadline at work|coworker|team lead)\b|회사|회의|보고서|상사|팀장|출근|퇴근|업무/i],
];

/** Who is this? From the pick (exact, in English or the screen's language) or words in the first messages. null = not sure yet. */
export function guessFace(text: string, tr: TFn = (s) => s): Face | null {
  const t = text.trim();
  const pick = PICKS.find((p) => p.en === t || tr(p.en) === t);
  if (pick) return pick.face;
  for (const [face, re] of WORDS) if (re.test(t)) return face;
  return null;
}

const TONE: Record<Face, string> = {
  student: "A student (18+). Casual and quick. Take the chores around studying off their plate (deadlines, sign-ups, schedules) — never do graded work for them. Friends and plans matter too.",
  worker: "An office worker. Brief and practical. They lose most of the week to «work about work» (chasing updates, finding things) — offer things that run every week without babysitting.",
  shop: "Runs a shop or small business. Concrete and money-minded: time and money saved on day one. Avoid tech words.",
  builder: "Technical (developer or founder). Be exact, show the source line or data behind every value, say what you're unsure of, offer to show or export the recipe. Skip hand-holding. Wrong-but-close answers are what they hate most.",
  senior: "Likely 50+ and new to tech. Short sentences, plain words, one step at a time, always give 2–4 options they can just pick. Speaking is fine. Build confidence: «You did it.» Never rush.",
  general: "Not sure who this is yet — keep it simple and friendly, give options to pick.",
};

export function faceTone(face: Face | null): string {
  return `## Who you're talking to\n${TONE[face ?? "general"]}`;
}

/** First chat (until onboarded): Unchore already said hello; lead the next few turns to one thing switched on today. */
export function onboardingGuide(lang: string, nudgeAt: string): string {
  return [
    "## First chat — this person is new",
    "You already greeted them, asked what to call them (their answer is their saved name — use it now and then, not in every line) and asked what keeps them busy. Over about three short turns:",
    "- Each turn: one warm line about what they said, then ONE easy question with a pick list (see «Pick buttons»). No long lists, no jargon.",
    "- By the third turn, offer three things you can take off their plate — fitted to them, doable today, free ones first (reminders, a daily brief, a price or news watch). Put them as a pick list and ask which one to switch on now.",
    `- When one fits them, prefer what our own team runs every day: ${FOUNDER_PICKS.map((p) => p.title).join(" · ")}.`,
    "- If they run a website, an app or a server (builders, shop owners), you may also offer the security check: they paste a log, code or a suspicious message into [Security check](/app/settings?tab=ai#security-check) and hear what happened and what to fix first — personal data and secrets are masked before any AI sees it.",
    "- When they choose one: if you still miss what it needs (the time and days, the date, the product or the price line), ask only that — one question with picks. Once you know it, repeat it back in ONE short line with no question (e.g. «Every weekday at 9:00 I'll send you …»). The app shows the switch-on card only under an answer that doesn't ask anything.",
    `- Once, near the end, say you'll drop by with a short note tomorrow at ${nudgeAt} (their time) and that they can change the time or say «stop» any time.`,
    `- Answer in ${langInfo(lang).en} unless they write in another language.`,
  ].join("\n");
}

/** «Tell me all your work» → four boxes → three to switch on today. Any day, not only the first. */
export const WORK_DUMP_GUIDE = [
  "## «All my work» sort",
  "If they want to list everything they do (they picked «Let me list all my work», or they dump many of their tasks at once):",
  "- If they haven't listed yet: ask them to pour out a normal day or week, by voice or text, small steps too («open Excel, copy the orders…») — the smaller, the better you can take it over. One line, no pick block.",
  "- Once they have: sort EVERY item into four boxes, as a short table or four headed lists — ① Only you can do it ② Repeats — I can do it with you ③ Should run without you ④ A habit you can drop. Keep their words; put an item in ② or ③ only if one of your recipes (or a reminder / AI brief) can really do it.",
  "- Then «Today, switch on these three» — the three easiest from ② and ③ (free ones first), as a pick list. When they pick one, go on as with any automation.",
  "- Offer once to keep the sorted list as a note so it can grow («My notes»). Answer in their language.",
].join("\n");

export const PICK_GUIDE = [
  "## Pick buttons",
  "When you ask a question that has a few likely answers, end your answer with a pick block. The app shows each line as a button the user can tap (they can still type):",
  "<<<pick>>>",
  "- first option",
  "- second option",
  "<<<end>>>",
  "2–6 short options, each under 40 characters, in the user's language. At most one block per answer, and only right after a question.",
  "When something is ready to automate, don't end that answer with a question or a pick block — the switch-on card only shows under an answer that asks nothing.",
].join("\n");

/** Pull the pick block out of an answer: the text without it, and the options. */
export function readPicks(text: string): { text: string; picks: string[] } {
  const m = /<<<pick>>>\s*([\s\S]*?)\s*(?:<<<end>>>|$)/.exec(text);
  if (!m) return { text, picks: [] };
  const picks = m[1]!.split("\n").map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim()).filter((l) => l && l.length <= 80).slice(0, 6);
  return { text: (text.slice(0, m.index) + text.slice(m.index + m[0].length)).trim(), picks };
}
