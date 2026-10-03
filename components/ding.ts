// A short soft «ding» from the browser's sound engine — said before a finished job is announced in voice mode (lib/voice/announce.ts).
export function ding(): void {
  try {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return;
    const ac = new C(), o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
    o.frequency.value = 880; o.connect(g); g.connect(ac.destination);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.start(t); o.stop(t + 0.4);
    setTimeout(() => { void ac.close().catch(() => {}); }, 600);
  } catch { /* no sound engine — the spoken line still comes */ }
}
