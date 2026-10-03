// A short correction or complaint that leans on the chat so far («still not working», «that's not what I meant») must not go to
// the light model — these need the earlier answers read properly (ported from AI Soul lib/pick-floor.ts, 2026-09-30 sync).
// Also a long paste (over 1,500 characters). Only «Auto» is affected; a model the member picked stays as it is.
import { wordsRe } from "./words";
import W_NOT_RIGHT from "./words/not_right.json";

const FIXUP_ANY = wordsRe(W_NOT_RIGHT);   // every other language (lib/words)
const FIXUP_KO = /(아직도|아직\s*(안|못)|그게\s*아니|그거\s*아니|그런\s*뜻이?\s*아니|아니라(고|니까)?|다시\s*(해|말|설명|봐)|엉뚱|틀렸|틀린|잘못|이해\s*(를\s*)?(못|안)|맥락|제대로|말\s*했잖|했잖아|안\s*됐|안\s*되잖|답답|왜\s*(안|이렇|그렇|또))/;
const FIXUP_EN = /\b(still (not|doesn'?t|isn'?t|broken|wrong)|not what i (meant|asked)|that'?s (wrong|not it|not right)|you('re| are) wrong|wrong again|try again|doesn'?t work|didn'?t work|i (already|just) (said|told)|as i said|read (it )?again|you misunderstood|makes no sense|why (not|again|did you))\b/i;

/** Does this message need the earlier chat read carefully? (a prior answer exists and it reads like a fix-up, or it's a long paste) */
export function needsContext(text: string, hadAnswer: boolean): boolean {
  if (text.length > 1500) return true;
  return hadAnswer && (FIXUP_KO.test(text) || FIXUP_EN.test(text) || FIXUP_ANY.test(text));
}
