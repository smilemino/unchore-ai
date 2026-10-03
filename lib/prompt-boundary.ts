// Prompt cache boundary (ported from AI Soul lib/prompt-boundary.ts, 2026-09-30 sync).
// Everything above this line in the system prompt is the same on every turn (who Unchore is, how to answer, file and reminder rules),
// so the AI company can reuse it instead of reading it fresh: Anthropic keys get a cache mark on that part (cache reads cost about a
// tenth), the Claude plan's own program understands the line itself, and OpenAI/OpenRouter cache a repeated beginning on their own —
// the line is removed before sending to them. Below it: the time, the member's instructions, memories — what changes.
export const PROMPT_BOUNDARY = "__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__";

/** Remove the boundary line (for AI companies that don't know it). */
export function stripPromptBoundary(s: string): string {
  return s.includes(PROMPT_BOUNDARY) ? s.replace(/\n*__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__\n*/g, "\n\n") : s;
}

/** Anthropic system blocks: the fixed part marked for caching, the rest after it. No boundary → one plain block. */
export function anthropicSystem(s: string): Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }> {
  const i = s.indexOf(PROMPT_BOUNDARY);
  if (i < 0) return [{ type: "text", text: s }];
  const head = s.slice(0, i).trim(), tail = s.slice(i + PROMPT_BOUNDARY.length).trim();
  return [{ type: "text", text: head, cache_control: { type: "ephemeral" } }, ...(tail ? [{ type: "text" as const, text: tail }] : [])];
}
