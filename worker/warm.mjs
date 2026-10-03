// Plan programs started ahead (AI Soul worker/engines/warm.ts): when a member starts typing or turns voice mode on, the app asks
// for their Claude Code / Codex to be launched now, so the answer only has to be fed in — AI Soul measured Claude's first letter
// 2.08 s → 0.99 s, Codex 2.3–9.3 s → 0.6 s. Nothing is asked of the AI before the question goes in, so it costs the member nothing.
// Rules (owner 2026-10-02): one per member, only that member's own turn takes it (it runs in their own sign-in folder);
// at most 4 on the whole worker; closed after 3 minutes unused; none started while the worker has under 1 GB free.
// Counts (started / used / not used) go to the log and /health — never who or what. Off: UC_PREWARM=0.
import os from "node:os";
import { readFileSync } from "node:fs";

const GB = 1024 ** 3;

/** Free memory: the machine's, or the container's room under its limit when that is smaller (Railway runs in one). */
export function freeBytes(read = (f) => readFileSync(f, "utf8")) {
  let free = os.freemem();
  try {
    const max = read("/sys/fs/cgroup/memory.max").trim();
    if (max !== "max") free = Math.min(free, Number(max) - Number(read("/sys/fs/cgroup/memory.current").trim()));
  } catch { /* no cgroup v2 — the machine's figure */ }
  return free;
}

const alive = (w) => w.child.exitCode === null && w.child.signalCode === null;
function close(w) {
  try { w.child.stdin.end(); } catch { /* closed */ }   // Claude Code and Codex end by themselves when their input closes
  const t = setTimeout(() => { try { w.child.kill("SIGKILL"); } catch { /* gone */ } }, 5000);
  t.unref?.();
  w.child.once?.("exit", () => clearTimeout(t));
}

export class WarmPool {
  constructor({ on = true, max = 4, idleMs = 3 * 60_000, minFree = GB, free = freeBytes, now = Date.now, log = () => {} } = {}) {
    Object.assign(this, { on, max, idleMs, minFree, free, now, log });
    this.items = new Map();   // member id → { key, child, used, cleanup }
    this.stats = { started: 0, used: 0, unused: 0, full: 0, lowMemory: 0 };
    this.sweeper = null;
  }

  /** Have this member's program ready in the shape `key`. `launch()` → { child, cleanup?, dir? }. Returns what happened. */
  warm(userId, key, launch) {
    if (!this.on) return "off";
    const had = this.items.get(userId);
    if (had && had.key === key && alive(had)) { had.used = this.now(); return "kept"; }
    if (had) this.drop(userId, had);
    if (this.items.size >= this.max) { this.stats.full++; return "full"; }   // other members' programs are never pushed out
    if (this.free() < this.minFree) { this.stats.lowMemory++; return "low_memory"; }
    let w;
    try { w = { key, used: this.now(), ...launch() }; } catch { return "failed"; }
    w.child.on("exit", () => { if (this.items.get(userId) === w) this.items.delete(userId); w.cleanup?.(); });
    w.child.on("error", () => { if (this.items.get(userId) === w) this.items.delete(userId); });
    this.items.set(userId, w);
    this.stats.started++;
    this.log("warm started", this.report());
    if (!this.sweeper) { this.sweeper = setInterval(() => this.sweep(), 30_000); this.sweeper.unref?.(); }
    return "started";
  }

  /** This member's program, only if it is in exactly the shape this answer needs; anything else is closed (a miss). */
  take(userId, key) {
    const w = this.items.get(userId);
    if (!w) return null;
    this.items.delete(userId);
    if (w.key !== key || !alive(w) || this.now() - w.used > this.idleMs) { this.drop(userId, w); return null; }
    this.stats.used++;
    this.log("warm used", this.report());
    return w;
  }

  sweep() { for (const [id, w] of this.items) if (!alive(w) || this.now() - w.used > this.idleMs) this.drop(id, w); }

  drop(userId, w) {
    if (this.items.get(userId) === w) this.items.delete(userId);
    this.stats.unused++;
    close(w);
  }

  closeAll() { for (const w of this.items.values()) close(w); this.items.clear(); }

  /** Counts only. hitRate = programs an answer used / programs started. */
  report() { return { ...this.stats, open: this.items.size, hitRate: this.stats.started ? Math.round((this.stats.used / this.stats.started) * 100) / 100 : null }; }
}

export const pool = new WarmPool({ on: process.env.UC_PREWARM !== "0", log: (...a) => console.log(new Date().toISOString(), ...a.map((x) => (typeof x === "string" ? x : JSON.stringify(x)))) });
process.once("exit", () => pool.closeAll());
