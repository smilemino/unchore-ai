// Voice-mode marks the AI adds at the end of a spoken answer (see voiceGuide): <<<voice gender=m pitch=low accent="Busan Korean">>>
// asks the app to switch voices; <<<voice-offered>>> says it has offered a regional accent once. Shared by the server (turn) and
// the browser (hide the marks while the answer streams, never read them aloud). <<<voice-end>>> says the user wants to stop talking —
// the app reads the goodbye and closes voice mode, in any language (AI Soul 9/30: «그만할게요» should press «End voice mode» for me).
import type { VoiceWish } from "./catalog";

const MARK = /<<<voice(-offered|-end)?(\s[^>]*)?>>>/g;

// Private reasoning a model sometimes leaks into the reply (<analysis>…</analysis> etc.) — never shown or spoken (AI Soul 9/30).
const THINK = /<(analysis|thinking|think|reasoning|scratchpad)>[\s\S]*?(?:<\/\1>|$)/g;
export function stripVoiceMarks(text: string): string {
  return text.replace(THINK, "").replace(/<(?:a(?:n(?:a(?:l(?:y(?:s(?:i(?:s)?)?)?)?)?)?)?|t(?:h(?:i(?:n(?:k(?:i(?:n(?:g)?)?)?)?)?)?)?)?$/, "").replace(MARK, "").replace(/<<<(?:v(?:o(?:i(?:c(?:e[^>]*)?)?)?)?)?$/, "").replace(/[ \t]+\n/g, "\n").trim();
}

export function readVoiceMarks(text: string): { wish: VoiceWish | null; offered: boolean; end?: true } {
  let wish: VoiceWish | null = null; let offered = false; let end = false;
  for (const m of text.matchAll(MARK)) {
    if (m[1] === "-end") { end = true; continue; }
    if (m[1]) { offered = true; continue; }
    const w: VoiceWish = {};
    for (const kv of (m[2] ?? "").matchAll(/(\w+)=("([^"]*)"|'([^']*)'|(\S+))/g)) {
      const k = kv[1]!, v = (kv[3] ?? kv[4] ?? kv[5] ?? "").trim();
      if (k === "gender" && /^(m|male|man)$/i.test(v)) w.gender = "m";
      else if (k === "gender" && /^(f|female|woman)$/i.test(v)) w.gender = "f";
      else if (k === "pitch") { const p = /^(low|lower|calm|deep|1)$/i.test(v) ? 1 : /^(high|higher|bright|3)$/i.test(v) ? 3 : /^(mid|medium|normal|2)$/i.test(v) ? 2 : 0; if (p) w.pitch = p as 1 | 2 | 3; }
      else if (k === "accent" && v && v.length <= 60) w.accent = v;
      else if (k === "reset" && v !== "0") w.reset = true;
      else if (k === "other" && v !== "0") w.other = true;
    }
    if (Object.keys(w).length) wish = { ...(wish ?? {}), ...w };
  }
  return end ? { wish, offered, end: true } : { wish, offered };
}

export type VoiceTurn = { lang: string; current: string; askVoice?: boolean; offerAccent?: boolean };

/** Extra instructions for a spoken turn. `accents` are the other regional accents Google has for this language. */
export function voiceGuide(v: VoiceTurn, accents: string[]): string {
  const list = accents.length ? accents.map((a) => `«${a}»`).join(", ") : "none yet";
  const lines = [
    "## Voice mode — this answer is read aloud",
    `- The user is talking, not typing (language heard: ${v.lang || "unknown"}). Answer in the language they spoke. Keep it spoken: no lists, tables, links, code or boxes unless they ask; say numbers the way people say them. Small talk, thanks and yes/no checks get one or two sentences; an explanation, a list or a report they asked for is said in full, nothing left out — for a list, say how many first, then each one (AI Soul f5febae: «tell me all of it; if it's long I'll stop it» — they can stop you any time).`,
    "- A job left running in this chat (an app build, a computer's work) puts its report here as a message when it finishes, and voice mode reads it to them in full. If they ask about something in such a report — «what was the third one?», «why did it fail?» — answer from that message at once; don't start the job again or say you'll check. Only what the report doesn't hold needs new work.",
    `- If the user asks to change how your voice sounds (a male or female voice, lower or calmer, brighter, a regional accent, a different voice, or back to the first one), say in one short sentence, in their language, that you'll switch, and end with one line such as <<<voice gender=m>>>, <<<voice pitch=low>>>, <<<voice accent="${accents[0] ?? "…"}">>>, <<<voice other=1>>> or <<<voice reset=1>>> — only what they asked for; keys can be combined. Regional accents available in this language: ${list}; «standard» means the everyday accent. If they ask for anything else (another accent, speed, a celebrity's voice), say it isn't available yet. Questions about the voice (price, which one it is) are normal questions — answer them without the line.`,
    "- One topic at a time (AI Soul 9/30: «finish one topic, then the next — the flow kept jumping back and forth»). Answer only what the user is talking about right now; don't bring up other things they didn't ask about. If they ask two things, say so, finish the first, then the second. If they change the subject, follow them, and only after that topic is done add one sentence to come back to what was left. If the conversation shows your earlier answer was cut off because they kept talking, don't repeat it from the start — answer what they just said.",
    "- The user may pause before they finish (AI Soul 9/29–30: «a half sentence was taken as the whole request»). If their words trail off mid-sentence — they end on «and…», «so», «but», «um», «I mean», a connecting word or a particle, with no request finished yet — don't guess the rest: say only one short line in their language such as «I'm listening — go on» (not the same line as your last one) and wait; the app listens again and their next words continue this. But if the same message already holds a finished question or request and only the end trails off, answer that request.",
    "- Every word you write is read aloud to the user (AI Soul 10/2: a note to itself — «Utterance seems cut off. Respond …» — was spoken to the owner). Never write notes to yourself about their words or what to answer; write only what you say to them, in their language.",
    "- Memory is the past, not now (AI Soul 9/30: «from my memory, eight decisions are left» was wrong). When asked about the current state of the user's own things — whether something was sent, finished, switched on or paid, how many are left, what still needs deciding — don't answer from memory or a guess as if it were fact. If a connected tool can check it, check first; if not, say in one sentence that you can't see it right now and what they could check.",
    "- If the user wants to stop talking now — to end this voice conversation, in any language and any wording (e.g. «that's all for now», «let's stop here», «bye for now», «그만할게요», «대화 종료하겠습니다», «terminemos aquí», «じゃあ、終わりにします») — answer with one short goodbye in their language and end with <<<voice-end>>>; the app then closes voice mode by itself. Not when they want you to stop or cancel a task or a reminder, to stop reading this answer, when they talk about the feature itself, or when it's unclear — then just answer.",
  ];
  if (v.askVoice) lines.push("- After your answer, add one short sentence asking whether this voice is all right, and that they can just say things like «a male voice» or «calmer» to change it. Only this once.");
  if (v.offerAccent && accents.length) lines.push(`- Only if the user's own words clearly show one of these regional ways of speaking: ${list} — offer once, in one short friendly sentence, to answer in that accent, and add <<<voice-offered>>>. Never switch by yourself and never comment on how they speak. If it isn't clear, don't offer.`);
  return lines.join("\n");
}
