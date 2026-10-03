// Keep the screen on while voice mode is open (AI Soul components/voice-client.ts Awake): when a phone screen goes dark,
// listening and reading aloud stop. Asked again when the tab comes back (the browser drops the lock on hiding);
// a device that can't keep the screen on is simply left as it is.
type Lock = { release(): Promise<void> };
type WakeNav = { wakeLock?: { request(t: "screen"): Promise<Lock> } };

export class Awake {
  private lock: Lock | null = null;
  private want = false;
  private vis = () => { if (document.visibilityState === "visible" && this.want) void this.grab(); };
  async on(): Promise<void> { if (this.want) return; this.want = true; document.addEventListener("visibilitychange", this.vis); await this.grab(); }
  off(): void { this.want = false; document.removeEventListener("visibilitychange", this.vis); const l = this.lock; this.lock = null; void l?.release().catch(() => {}); }
  private async grab(): Promise<void> {
    try {
      const wl = (navigator as unknown as WakeNav).wakeLock;
      if (!wl) return;
      const l = await wl.request("screen");
      if (this.want) this.lock = l; else void l.release().catch(() => {});   // turned off while asking
    } catch { /* not allowed now — the screen may go dark */ }
  }
}
