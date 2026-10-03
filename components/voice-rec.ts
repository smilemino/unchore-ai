"use client";
// Records the user's first words in voice mode as a small WAV (16 kHz, mono) until they pause, so the server can tell which language
// they speak (/api/voice/hear). After that the browser's own free recognition takes over in that language.
// Used only while the language is unknown, or on browsers without speech recognition.

const OUT_RATE = 16000;
const END_SILENCE_MS = 1400;   // this much quiet after speech = done
const NO_SPEECH_MS = 9000;     // nothing said at all → give up
const MAX_MS = 25000;

/** Mono float samples at `from` Hz → 16-bit PCM at 16 kHz (simple averaging; speech only). */
export function downsample(input: Float32Array, from: number): Int16Array {
  const ratio = from / OUT_RATE;
  const n = Math.floor(input.length / ratio);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * ratio), b = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0; for (let j = a; j < b; j++) sum += input[j]!;
    const v = Math.max(-1, Math.min(1, sum / Math.max(1, b - a)));
    out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  return out;
}

export function wav(pcm: Int16Array, rate = OUT_RATE): Uint8Array {
  const buf = new ArrayBuffer(44 + pcm.length * 2); const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + pcm.length * 2, true); str(8, "WAVE"); str(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, "data"); v.setUint32(40, pcm.length * 2, true);
  new Int16Array(buf, 44).set(pcm);
  return new Uint8Array(buf);
}

/** Starts recording; resolves with the WAV once the speaker pauses (null if nothing was said or the mic is unavailable).
 *  The returned stop() ends it early (keeps what was said). Pass the audio context unlocked by the user's tap (Speaker.audio()) —
 *  on iPhones a context made later, outside the tap, stays silent. */
export function recordUtterance(shared?: AudioContext | null): { done: Promise<Uint8Array | null>; stop: () => void } {
  let stopNow = () => {};
  const done = new Promise<Uint8Array | null>((resolve) => {
    void (async () => {
      let stream: MediaStream;
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } }); }
      catch { resolve(null); return; }
      const A = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      const ctx = shared ?? new A();
      if (ctx.state === "suspended") await ctx.resume().catch(() => {});
      const src = ctx.createMediaStreamSource(stream);
      const node = ctx.createScriptProcessor(4096, 1, 1);
      const chunks: Float32Array[] = [];
      const t0 = Date.now(); let spokeAt = 0; let lastLoud = 0; let floor = 0.004; let finished = false;
      const finish = (keep: boolean) => {
        if (finished) return; finished = true;
        node.disconnect(); src.disconnect(); stream.getTracks().forEach((t) => t.stop()); if (!shared) void ctx.close().catch(() => {});
        if (!keep || !spokeAt) { resolve(null); return; }
        const all = new Float32Array(chunks.reduce((n, c) => n + c.length, 0)); let o = 0;
        for (const c of chunks) { all.set(c, o); o += c.length; }
        resolve(wav(downsample(all, ctx.sampleRate)));
      };
      stopNow = () => finish(true);
      node.onaudioprocess = (e) => {
        const x = e.inputBuffer.getChannelData(0); chunks.push(new Float32Array(x));
        let s = 0; for (let i = 0; i < x.length; i++) s += x[i]! * x[i]!;
        const rms = Math.sqrt(s / x.length); const now = Date.now();
        if (!spokeAt) floor = floor * 0.95 + Math.min(rms, 0.02) * 0.05;   // learn the room's background noise before speech
        if (rms > Math.max(0.012, floor * 3)) { lastLoud = now; if (!spokeAt) spokeAt = now; }
        if (spokeAt && now - lastLoud > END_SILENCE_MS) finish(true);
        else if (!spokeAt && now - t0 > NO_SPEECH_MS) finish(false);
        else if (now - t0 > MAX_MS) finish(true);
      };
      src.connect(node); node.connect(ctx.destination);
    })();
  });
  return { done, stop: () => stopNow() };
}
