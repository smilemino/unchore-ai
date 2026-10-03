// Hand-over on deploy: Railway sends SIGTERM to the old worker when a new one is up. Exiting right away cut every member's
// answer, app build and video still running there. Now the old worker takes no new work (503 — the app moves on to the
// new worker or asks again, lib/ai.ts canRetrySame) and exits once what it holds is done, or after maxMs at the latest.
// Railway kills it anyway after the service's «draining seconds» — set that at least as long as maxMs.
export const DRAIN_MAX_MS = 13 * 60_000;   // an answer stops itself at 760 s (lib/answer-clock.ts)

/** May the draining worker leave — nothing left running, or held past the limit. */
export function drainDone(inFlight, sinceMs, nowMs, maxMs = DRAIN_MAX_MS) {
  return inFlight === 0 || nowMs - sinceMs > maxMs;
}

/** Counts running requests and, once start() is called, exits when drainDone says so. */
export function makeDrain({ exit, log = () => {}, now = Date.now, maxMs = DRAIN_MAX_MS, everyMs = 1000 }) {
  let inFlight = 0, since = 0, timer = null;
  const check = () => {
    if (!drainDone(inFlight, since, now(), maxMs)) return false;
    clearInterval(timer);
    log("drain", "exit", `${inFlight} still running`, `${now() - since}ms`);
    exit(0);
    return true;
  };
  return {
    get draining() { return since > 0; },
    get inFlight() { return inFlight; },
    /** Count this request until its response closes (finished, or the app let go). */
    track(res) { inFlight++; res.once("close", () => { inFlight--; if (since) check(); }); },
    start() {
      if (since) return;
      since = now();
      log("drain", "start", `${inFlight} running`);
      if (!check()) { timer = setInterval(check, everyMs); timer.unref?.(); }
    },
  };
}
