// Side jobs before an answer (old-chat summary, own words, Google read, live values) get a time limit: when one is late the answer
// is made without it instead of waiting (ported from AI Soul worker/answer.ts within — two of 8 parallel answers stalled 16 min there).
// The late job may still finish in the background; its result is dropped.
export function within<T>(p: Promise<T>, ms: number, fallback: T, what: string): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<T>((ok) => { t = setTimeout(() => { console.warn(`[turn] side job late, skipped: ${what} (${Math.round(ms / 1000)} s)`); ok(fallback); }, ms); });
  return Promise.race([p, late]).finally(() => clearTimeout(t));
}
