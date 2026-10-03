import { complete, providerOf, type Provider } from "./ai";
import { wordsRe } from "./words";
import W_VERBATIM from "./words/verbatim_ask.json";

const VERBATIM_ANY = wordsRe(W_VERBATIM);   // every other language (lib/words)

// Plain-words check (ported from AI Soul lib/plain-gate.ts + worker/plain-gate.ts): before a long or technical answer is saved,
// the member's small AI asks «would a non-expert follow this?»; if not, the answering AI rewrites it once in plain words.
// Off by default — it uses the member's AI once or twice more (Settings → AI). The rewrite is dropped if it loses numbers,
// copy boxes, decide boxes or app marks, or shrinks below 40% — then the original stays.
const DEV_WORDS = /\b(api|sdk|json|yaml|regex|cli|repo|commit|deploy|endpoint|schema|query|payload|runtime|middleware|webhook|oauth|token|env|localhost|stack trace|refactor|dependency|npm|pnpm|docker|kubernetes|sql)\b/gi;

/** How «developer» the text reads: code, snake/camelCase names, paths, jargon — copy boxes and the «details» part don't count. */
export function jargonScore(text: string): number {
  const t = text.replace(/```(copy|복사)[\s\S]*?```/gi, "").split(/\n(?:근거\(기술\)|Details \(technical\))/i)[0]!.replace(/https?:\/\/\S+/g, "");
  return (t.match(/```/g)?.length ?? 0) / 2 + (t.match(/`[^`\n]+`/g)?.length ?? 0) * 0.5 + (t.match(/\b[a-z]+_[a-z_]+\b|\b[a-z]+[A-Z][a-zA-Z]+\b/g)?.length ?? 0) * 0.5
    + (t.match(/(?:^|\s)\/[\w.-]+\/[\w./-]+/g)?.length ?? 0) + (t.match(DEV_WORDS)?.length ?? 0) * 0.5;
}

/** The question is written in a non-Latin script (Korean, Japanese, Chinese, Cyrillic, Arabic, Thai, Hindi…) but the answer's
 *  body is mostly Latin letters — the AI slipped into English. Code, links and the «details» part don't count.
 *  (AI Soul 2026-10-01 record review: 11 such answers in 6 days, most under 200 characters, so the length check skipped them.) */
export function wrongScript(question: string, answer: string): boolean {
  const other = /[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/gu;
  if ((question.match(other)?.length ?? 0) < 3 || (question.match(/\p{Script=Latin}/gu)?.length ?? 0) > (question.match(other)?.length ?? 0)) return false;
  const b = answer.split(/\n\**\s*(?:근거\s*\(기술\)|Details \(technical\))/i)[0]!.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "").replace(/https?:\/\/\S+/g, "");
  const native = b.match(other)?.length ?? 0, latin = b.match(/\p{Script=Latin}/gu)?.length ?? 0;
  return latin >= 15 && latin > native * 3;
}

/** Worth checking: long, or medium and technical — and the member didn't ask for code, logs or the original wording. */
export function worthChecking(answer: string, question: string): boolean {
  if (/(원문|코드 그대로|로그|영어로)|\b(verbatim|raw|exact code|the code|logs?|in english)\b/i.test(question) || VERBATIM_ANY.test(question)) return false;
  return wrongScript(question, answer) || answer.length >= 600 || (answer.length >= 200 && jargonScore(answer) >= 2);
}

const JUDGE = `Would an ordinary adult with no technical background understand this answer without help? It is «hard» also when a sentence has no jargon but is compressed shorthand that leaves out who did what and what it means for them — a line they would quote back asking «what does this mean?». First line: «easy» or «hard». Second line: why, in a few words.`;
const REWRITE = `Rewrite the answer below so an ordinary adult with no technical background understands it at once, in the language of the question — if the answer is in another language, translate it (names and on-screen words stay as they are, with their meaning once).
Order: the answer in one line → a plain explanation (one everyday comparison if it helps) → what it means for them → what they need to do (or «nothing»).
Unpack compressed shorthand sentences (who did what, and what it means for them — worry or not) into two or three plain sentences; explaining is not changing a fact. Give a first-use term a short meaning.
Keep every number, name, link and fact. Move code, paths and settings names to a short «Details (technical)» part at the end.
Copy exactly, without changing one character: every \`\`\`copy block, every line starting with <<< and every block between <<<…>>> and <<<end>>>. In a \`\`\`decide block you may reword only the text inside.
No greeting, no sign-off. Output only the rewritten answer.`;

const count = (s: string, re: RegExp) => s.match(re)?.length ?? 0;
/** Keep the rewrite only if nothing important was lost. */
export function acceptRewrite(orig: string, next: string, translated = false): boolean {
  if (!next.trim() || next.length < orig.length * (translated ? 0.2 : 0.4)) return false;   // Korean/Japanese/Chinese run far shorter than English
  const nums = orig.match(/\d[\d,.]*\d/g) ?? [];
  if (nums.length >= 4 && nums.filter((n) => next.includes(n)).length / nums.length < 0.8) return false;
  if (count(orig, /```decide/gi) !== count(next, /```decide/gi)) return false;
  const copies = (s: string) => s.match(/```(copy|복사)[\s\S]*?```/gi) ?? [];
  if (copies(orig).join("\n") !== copies(next).join("\n")) return false;
  const marks = (s: string) => (s.match(/^<<<.*$/gm) ?? []).join("\n");
  return marks(orig) === marks(next);
}

/** The plain version, or null (not needed, not easier, or the AI couldn't). Never throws. */
export async function plainGate(answer: string, question: string, o: { judge: string | null; writer: string; keys: Partial<Record<Provider, string>> }): Promise<string | null> {
  if (!o.judge || !worthChecking(answer, question)) return null;
  try {
    const translate = wrongScript(question, answer);   // wrong language: no need to ask the judge
    if (!translate) {
      const v = await complete({ model: o.judge, key: o.keys[providerOf(o.judge)]!, maxTokens: 60, system: JUDGE, messages: [{ role: "user", content: answer.slice(0, 8000) }] });
      if (!/^\s*hard/i.test(v)) return null;
    }
    const next = await complete({ model: o.writer, key: o.keys[providerOf(o.writer)]!, maxTokens: 6000, system: REWRITE, messages: [{ role: "user", content: `Question: ${question.slice(0, 2000)}\n\nAnswer to rewrite:\n${answer}` }] });
    return acceptRewrite(answer, next.trim(), translate) ? next.trim() : null;
  } catch { return null; }
}
