// Seats for plan answers on the worker (AI Soul worker/admission.ts, 2026-10-02 port). One worker serves every member, so a fixed
// «4 at once, the 5th gets busy at once» made two members typing together see «Busy». Now a turn past the seats waits in line
// (first come, first served) for up to SLOT_WAIT_MS and only then hears «busy» — well inside the app's 60 s first-word clock.
// Side calls (titles, memory, notes, judging — lib/ai.ts completeSide) take their own small set of seats, so a quick title
// never holds a member's answer back and a busy hour of answers doesn't stall the side jobs.
export const SLOT_WAIT_MS = Number(process.env.SLOT_WAIT_MS ?? 30_000);

export class Slots {
  constructor(max, waitMs = SLOT_WAIT_MS) { this.max = max; this.waitMs = waitMs; this.running = 0; this.line = []; }

  /** Resolves to a release function, or null if no seat came free in time (or the caller went away). */
  take(signal) {
    if (this.running < this.max && this.line.length === 0) { this.running++; return Promise.resolve(this.#release()); }
    if (signal?.aborted || this.waitMs <= 0) return Promise.resolve(null);
    return new Promise((resolve) => {
      const w = { resolve, t: null, off: null };
      const leave = () => { const i = this.line.indexOf(w); if (i >= 0) this.line.splice(i, 1); clearTimeout(w.t); signal?.removeEventListener("abort", leave); resolve(null); };
      w.t = setTimeout(leave, this.waitMs);
      w.off = () => { clearTimeout(w.t); signal?.removeEventListener("abort", leave); };
      signal?.addEventListener("abort", leave);
      this.line.push(w);
    });
  }

  #release() {
    let done = false;
    return () => {
      if (done) return;
      done = true;
      const next = this.line.shift();
      if (next) { next.off(); next.resolve(this.#release()); } else this.running--;
    };
  }

  report() { return { running: this.running, waiting: this.line.length, max: this.max }; }
}
