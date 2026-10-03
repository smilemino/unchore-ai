// Voice mode keeps listening while the answer is being made (ported from AI Soul 9/29 48f1528 · 8c0fb42 · 9/30 4dceefb).
// Words added right after sending belong to the same request: the answer being made is stopped and the new words go at once
// (the AI sees the earlier message and the cut-off answer — lib/voice/marker.ts «one topic at a time»). Later words wait in
// the queue and are sent when this answer is done. An answer that arrives while the user is still talking is read only if they
// said nothing more; if they did, their new words go first and the answer stays on screen.
export const MERGE_MS = 8000;

/** What to do with words heard while an answer is being made. */
export function whileThinking(sentAt: number, now: number): "merge" | "queue" {
  return sentAt > 0 && now - sentAt <= MERGE_MS ? "merge" : "queue";
}
