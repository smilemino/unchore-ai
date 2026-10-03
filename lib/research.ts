// Deep research (ported from AI Soul worker/research.ts + soul/research.md): the member presses «🔎 Deep research»; the answer
// plans first, searches the web up to 8 times showing each search, then writes a report with sources. Only when asked — it
// costs the member more than a normal answer. Needs a Claude or OpenRouter key (their web search); otherwise it says so.
export const RESEARCH_SEARCHES = 8;
export const RESEARCH_MAX_TOKENS = 12_000;
// Time limit (AI Soul lib/research-limits.ts): shown on the button before it's pressed; when reached, what was found so far is
// kept with a «stopped here» note. No money limit here — a member's own key doesn't report the cost while answering.
export const RESEARCH_MAX_MINUTES = 5;
/** When a deep research answer must stop: its own limit, or the whole answer's deadline if that comes first. */
export const researchEndAt = (t0: number, answerEnd: number) => Math.min(answerEnd, t0 + RESEARCH_MAX_MINUTES * 60_000);

export const RESEARCH_GUIDE = [
  "## Deep research (the user pressed «Deep research»)",
  "1. Start with «## Plan» — 3 to 6 short lines: what you will check and where.",
  `2. Search the web (up to ${RESEARCH_SEARCHES} searches). Right before each search write one line «🔎 <what you are looking for>».`,
  "3. Then the report, in the user's language, with these parts: Conclusion (one or two lines) · Evidence (each point with its source link and date) · Where sources disagree · What I couldn't confirm · My guesses (marked as guesses).",
  "Prefer official pages, studies and recent data over blogs; say how recent each number is. Don't invent sources or numbers; if you couldn't find something, say so.",
].join("\n");
