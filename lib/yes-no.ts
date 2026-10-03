import type { Lang } from "./i18n";

// Yes / No buttons under a plain yes-or-no question (ported from AI Soul lib/conv-mark.ts yesNoAsk, 2026-09-25).
// Only when the answer ends on exactly one question that a «yes» or «no» can answer — never under «which / when / how many…»
// questions, «A or B?» choices, a pick block (those have their own buttons) or a decide / approve / secret box (their own cards).
// English and Korean only: the shape of a yes-no question is read from the words, and a wrong pair of buttons under an open
// question is worse than none. Other languages still get pick buttons when the AI writes them.

const BOXED = /<<<|```\s*(?:decide|decision|secret|결정|비밀값)\b|\[\[(?:approve|confirm)/i;
const ENDS_ASKING = /[?？]\s*[)"'”’]*$/;

const EN_ASKS = /^(?:(?:so|then|ok(?:ay)?|great|alright|and)[,!]?\s+)?(?:shall|should|can|could|may|would|will|do|does|did|is|are|was|were|want|ready|sound|ok(?:ay)?|any)\b/i;
const EN_OPEN = /\b(?:what|which|when|where|who|whom|whose|why|how)\b|\bor\b/i;
const EN_SAY = /\b(?:yes or no|yes\/no)\b/i;

const KO_ASKS = /(?:까요|습니까|실래요|주시겠어요)\s*[?？]\s*[)"'”’]*$/;
const KO_OPEN = /어떤|어떻게|무엇|뭐|뭘|어느|언제|몇|누구|어디|왜|얼마|아니면/;
const KO_SAY = /예\s*[·/,]\s*아니오|네\s*[·/,]\s*아니요|「(?:예|네)」\s*(?:또는|나|이나)\s*「아니(?:오|요)」/;

/** Does this answer end on one plain yes-or-no question? */
export function yesNoAsk(text: string | null | undefined, lang: Lang): boolean {
  if (lang !== "en" && lang !== "ko") return false;
  const s = String(text ?? "");
  if (!s.trim() || BOXED.test(s)) return false;
  const lines = s.trimEnd().split("\n").map((l) => l.replace(/[*_`#>]/g, "").trim()).filter(Boolean);
  const last = lines.at(-1) ?? "";
  if (lang === "en" ? EN_SAY.test(lines.slice(-2).join(" ")) : KO_SAY.test(lines.slice(-2).join(" "))) return true;
  if (!ENDS_ASKING.test(last) || /^(?:[-*•]|\d+[.)])\s/.test(last)) return false;
  const asks = last.split(/(?<=[.!。?？])\s+/).filter((x) => /[?？]\s*[)"'”’]*$/.test(x));
  if (asks.length !== 1) return false;
  const q = asks[0]!;
  return lang === "en" ? EN_ASKS.test(q) && !EN_OPEN.test(q) : KO_ASKS.test(q) && !KO_OPEN.test(q);
}
