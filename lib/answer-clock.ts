// Time limits on one AI call inside an answer (ported from AI Soul worker/answer.ts FIRST_OUTPUT_MS / TOTAL_MS).
// · No first sign of life (a word, or a tool starting) within `firstMs` → this AI is cut and the member's next one answers.
// · The whole answer must end before the server's own limit (app/api/chat/route.ts maxDuration 800) so what was written is
//   saved with a note instead of the answer vanishing when the server is stopped.

/** First sign of life: a plain answer, and one that searches the web or uses tools first. */
export const FIRST_OUTPUT_MS = 60_000;
export const FIRST_OUTPUT_SLOW_MS = 150_000;
/** The whole answer, from the question arriving — 40 s under the chat route's 800 s, left for saving. */
export const TOTAL_MS = 760_000;

export type Cut = "first" | "total";
export type Clock = { signal: AbortSignal; alive: () => void; cut: () => Cut | null; end: () => void };

/** One clock per AI call. `parent` is ■ Stop; `endAt` is the deadline of the whole answer (epoch ms). */
export function answerClock(o: { parent: AbortSignal; firstMs: number; endAt: number; now?: number }): Clock {
  const ac = new AbortController();
  let why: Cut | null = null;
  const stop = (w: Cut) => { if (!why && !o.parent.aborted) { why = w; ac.abort(); } };
  let first: ReturnType<typeof setTimeout> | null = setTimeout(() => stop("first"), o.firstMs);
  const total = setTimeout(() => stop("total"), Math.max(0, o.endAt - (o.now ?? Date.now())));
  const end = () => { if (first) clearTimeout(first); first = null; clearTimeout(total); };
  return {
    signal: AbortSignal.any([o.parent, ac.signal]),
    alive: () => { if (first) { clearTimeout(first); first = null; } },
    cut: () => why,
    end,
  };
}
