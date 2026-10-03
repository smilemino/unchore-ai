// Voice mode with Google's voice (owner decision 2026-09-29): voice list and picking by words, the AI's voice marks,
// metering of Google's audio, the first-words language check, and the browser-side audio helpers.
import { describe, expect, it } from "vitest";
import { VOICES, VOICE_ID_KEY, defaultVoice, isVoice, localeFor, mainAccent, otherAccents, pickVoice, voiceChoices, voiceOf } from "@/lib/voice/catalog";
import { readVoiceMarks, stripVoiceMarks, voiceGuide } from "@/lib/voice/marker";
import { WON_PER_SEC, audioOfLine, dayIn, parseHeard, pcmStream, speakSecPerDay, ttsBody, wavSeconds } from "@/lib/voice/google";
import { pcmToFloat, pieces } from "@/components/voice-out";
import { downsample, wav } from "@/components/voice-rec";
import { bcp47 } from "@/components/speech";

describe("voice list", () => {
  it("has Google's 30 locales plus 30 voices that read any language", () => {
    expect(VOICES.length).toBe(2089);
    expect(new Set(VOICES.filter((v) => v.locale !== "*").map((v) => v.locale)).size).toBe(30);
    expect(VOICES.filter((v) => v.locale === "*")).toHaveLength(30);
  });
  it("finds the locale from whatever the phone or the listener says", () => {
    expect(localeFor("ko")).toBe("ko-KR");
    expect(localeFor("ko-KR")).toBe("ko-KR");
    expect(localeFor("ja")).toBe("ja-JP");
    expect(localeFor("en")).toBe("en-US");
    expect(localeFor("en-GB")).toBe("en-GB");
    expect(localeFor("es-MX")).toBe("es-419");
    expect(localeFor("es")).toBe("es-ES");
    expect(localeFor("pt")).toBe("pt-BR");
    expect(localeFor("ar-SA")).toBe("ar-001");
    expect(localeFor("th-TH")).toBe("*");
    expect(localeFor("")).toBe("*");
  });
  it("starts with one everyday voice per language (Korean = the same voice as AI Soul)", () => {
    expect(defaultVoice("ko-KR")).toBe("ko-kr-assistant-9");
    expect(defaultVoice("*")).toBe("kore");
    for (const l of ["ja-JP", "en-US", "fr-FR", "hi-IN", "es-419"]) {
      const v = voiceOf(defaultVoice(l))!;
      expect(v.locale, l).toBe(l);
      expect(v.accent, l).toBe(mainAccent(l));
      expect(v.gender, l).toBe("f");
    }
    expect(mainAccent("ja-JP")).toBe("Tokyo Japanese");
    expect(otherAccents("ko-KR")).toEqual(["Busan Korean"]);
    expect(otherAccents("ja-JP")).toEqual(["Fukuoka Japanese", "Osaka Japanese"]);
  });
  it("changes the voice the way the user asked, keeping the rest, and never picks the same voice", () => {
    const cur = "ko-kr-assistant-9";
    const male = voiceOf(pickVoice({ gender: "m" }, cur, "ko-KR"))!;
    expect(male.gender).toBe("m");
    expect(male.accent).toBe("Seoul Korean");
    const busan = voiceOf(pickVoice({ accent: "Busan Korean" }, cur, "ko-KR"))!;
    expect(busan.accent).toBe("Busan Korean");
    expect(busan.gender).toBe("f");
    const calm = voiceOf(pickVoice({ pitch: 1 }, male.id, "ko-KR"))!;
    expect(calm.gender).toBe("m");
    expect(calm.pitch).toBe(1);
    expect(calm.id).not.toBe(male.id);
    expect(pickVoice({ other: true }, cur, "ko-KR")).not.toBe(cur);
    expect(pickVoice({ reset: true }, busan.id, "ko-KR")).toBe(cur);
    expect(voiceOf(pickVoice({ accent: "standard" }, busan.id, "ko-KR"))!.accent).toBe("Seoul Korean");
    expect(voiceOf(pickVoice({ accent: "Osaka Japanese" }, cur, "ko-KR"))!.locale).toBe("ko-KR"); // not offered in this language → ignored
    expect(voiceOf(pickVoice({ gender: "m" }, "kore", "th-TH"))!.locale).toBe("*");
    expect(voiceOf(pickVoice({ gender: "m" }, "", "ja-JP"))!.locale).toBe("ja-JP");
    expect(isVoice("ko-kr-assistant-9")).toBe(true);
    expect(isVoice("nope")).toBe(false);
  });
});

describe("voice marks from the AI", () => {
  it("reads what to change and hides the marks", () => {
    const a = "네, 부산 말투 남자 목소리로 바꿀게요.\n<<<voice gender=m accent=\"Busan Korean\">>>";
    expect(readVoiceMarks(a)).toEqual({ wish: { gender: "m", accent: "Busan Korean" }, offered: false });
    expect(stripVoiceMarks(a)).toBe("네, 부산 말투 남자 목소리로 바꿀게요.");
    expect(readVoiceMarks("Sure. <<<voice pitch=low>>>").wish).toEqual({ pitch: 1 });
    expect(readVoiceMarks("OK <<<voice reset=1>>>").wish).toEqual({ reset: true });
    expect(readVoiceMarks("부산 말투로 해 드릴까요? <<<voice-offered>>>")).toEqual({ wish: null, offered: true });
    expect(readVoiceMarks("그냥 답")).toEqual({ wish: null, offered: false });
    expect(stripVoiceMarks("half way <<<voi")).toBe("half way");
    // 9/30 — «그만할게요» in any language: the AI marks the goodbye and the app closes voice mode
    expect(readVoiceMarks("네, 여기서 마칠게요. <<<voice-end>>>")).toEqual({ wish: null, offered: false, end: true });
    expect(stripVoiceMarks("Hasta luego. <<<voice-end>>>")).toBe("Hasta luego.");
    expect(stripVoiceMarks("じゃあまた <<<voice-en")).toBe("じゃあまた");
    expect(voiceGuide({ lang: "es-ES", current: "x" }, [])).toMatch(/<<<voice-end>>>/);
    expect(voiceGuide({ lang: "es-ES", current: "x" }, [])).toMatch(/One topic at a time/);
    expect(voiceGuide({ lang: "es-ES", current: "x" }, [])).toMatch(/Never write notes to yourself/);
    expect(voiceGuide({ lang: "es-ES", current: "x" }, [])).toMatch(/trail off mid-sentence/);
    expect(voiceGuide({ lang: "es-ES", current: "x" }, [])).toMatch(/Memory is the past, not now/);
  });
  it("adds the one-time questions only when asked to", () => {
    const g = voiceGuide({ lang: "ko-KR", current: "ko-kr-assistant-9", askVoice: true, offerAccent: true }, ["Busan Korean"]);
    expect(g).toMatch(/voice is all right/);
    expect(g).toMatch(/«Busan Korean»/);
    expect(g).toMatch(/<<<voice-offered>>>/);
    const h = voiceGuide({ lang: "ko-KR", current: "x" }, ["Busan Korean"]);
    expect(h).not.toMatch(/voice is all right/);
    expect(h).not.toMatch(/voice-offered/);
    expect(voiceGuide({ lang: "th-TH", current: "kore", offerAccent: true }, [])).not.toMatch(/voice-offered/);
  });
});

describe("google voice (server)", () => {
  it("60 minutes a day per member by default; one minute costs about 13 won", () => {
    expect(speakSecPerDay()).toBe(3600);
    expect(Math.round(WON_PER_SEC * 60)).toBe(13);
  });
  it("uses the member's own day", () => {
    const t = new Date("2026-09-29T20:00:00Z");
    expect(dayIn("Asia/Seoul", t)).toBe("2026-09-30");
    expect(dayIn("America/New_York", t)).toBe("2026-09-29");
    expect(dayIn("Not/AZone", t)).toBe("2026-09-29");
  });
  it("asks Google with a fixed seed for one steady voice", () => {
    const b = JSON.parse(ttsBody("안녕", "ko-kr-assistant-9"));
    expect(b.model).toBe("gemini-3.8-flash-lite-tts");
    expect(b.generation_config).toEqual({ speech_config: [{ voice: "ko-kr-assistant-9" }], seed: 7 });
  });
  it("passes audio through and meters exactly what was sent", async () => {
    const line = (bytes: number[]) => `data: ${JSON.stringify({ event_type: "step.delta", delta: { mime_type: "audio/l16", data: Buffer.from(bytes).toString("base64") } })}\n`;
    expect(audioOfLine("data: [DONE]")).toBeNull();
    expect(audioOfLine(line([1, 2]).trim())).toEqual(new Uint8Array([1, 2]));
    const enc = new TextEncoder();
    const sse = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(enc.encode(line([1, 2, 3, 4]) + "data: {\"event_type\":\"x\"}\n")); c.enqueue(enc.encode(line([5, 6]) + "data: [DONE]\n")); c.close(); } });
    let metered = -1;
    const out = pcmStream(sse, async (n) => { metered = n; });
    const got: number[] = []; const r = out.getReader();
    for (;;) { const { value, done } = await r.read(); if (done) break; got.push(...value); }
    expect(got).toEqual([1, 2, 3, 4, 5, 6]);
    expect(metered).toBe(6);
  });
  it("meters a stream the listener stopped early", async () => {
    const sse = new ReadableStream<Uint8Array>({ pull() { return new Promise(() => {}); } });
    let metered = -1;
    await pcmStream(sse, (n) => { metered = n; }).cancel();
    expect(metered).toBe(0);
  });
  it("reads the heard language and words", () => {
    expect(parseHeard('{"lang": "ja-JP", "text": "今日の天気は？"}')).toEqual({ lang: "ja-JP", text: "今日の天気は？" });
    expect(parseHeard('```json\n{"lang":"es-MX","text":"hola"}\n```')).toEqual({ lang: "es-MX", text: "hola" });
    expect(parseHeard('{"lang":"<script>","text":"x"}')).toEqual({ lang: "", text: "x" });
    expect(parseHeard('{"lang":"","text":""}')).toBeNull();
    expect(parseHeard("nope")).toBeNull();
    expect(parseHeard("ja-JP\n今日の天気は？")).toEqual({ lang: "ja-JP", text: "今日の天気は？" });
    expect(parseHeard("en-US\nMake me a timer.\nNow.")).toEqual({ lang: "en-US", text: "Make me a timer. Now." });
    expect(wavSeconds(44 + 32000 * 3)).toBe(3);
  });
});

describe("voice in the browser", () => {
  it("cuts answers at sentence ends into pieces Google accepts", () => {
    const long = Array.from({ length: 30 }, (_, i) => `문장 ${i}번은 조금 길게 써 봅니다.`).join(" ");
    const p = pieces(long);
    expect(p.length).toBeGreaterThan(1);
    for (const x of p) { expect(x.length).toBeLessThanOrEqual(380); expect(x.endsWith(".")).toBe(true); }
    expect(p.join(" ").replace(/\s+/g, " ")).toBe(long);
    expect(pieces("x".repeat(900)).every((x) => x.length <= 380)).toBe(true);
    expect(pieces("```code```")).toEqual([]);
  });
  it("turns PCM bytes into samples, carrying an odd byte to the next chunk", () => {
    const a = pcmToFloat(new Uint8Array([0x00, 0x40, 0xff]), null);
    expect(Array.from(a.samples)).toEqual([0.5]);
    expect(a.carry).toBe(0xff);
    const b = pcmToFloat(new Uint8Array([0xff]), a.carry);
    expect(b.samples[0]).toBeCloseTo(-1 / 0x8000, 6);
    expect(b.carry).toBeNull();
  });
  it("records the first words as a 16 kHz WAV", () => {
    const pcm = downsample(new Float32Array(48000).fill(0.5), 48000);
    expect(pcm.length).toBe(16000);
    const w = wav(pcm);
    expect(String.fromCharCode(...w.slice(0, 4))).toBe("RIFF");
    expect(w.length).toBe(44 + 32000);
    expect(wavSeconds(w.length)).toBe(1);
  });
  it("tells the browser which language to listen and speak in", () => {
    expect(bcp47("ko")).toBe("ko-KR");
    expect(bcp47("en")).toBe("en-US");
    expect(bcp47("ja-JP")).toBe("ja-JP");
  });
});

describe("leaked reasoning is never shown or spoken (AI Soul 9/30)", () => {
  it("drops a closed block", () => { expect(stripVoiceMarks("<analysis>New task: delegate.</analysis>Sure, I will do it.")).toBe("Sure, I will do it."); });
  it("hides an open block while streaming", () => { expect(stripVoiceMarks("Hi <thinking>still going")).toBe("Hi"); expect(stripVoiceMarks("Hi <anal")).toBe("Hi"); });
  it("keeps normal angle brackets", () => { expect(stripVoiceMarks("3 < 5 and <b>x</b>")).toBe("3 < 5 and <b>x</b>"); });
});

describe("voice list in Settings (AI Soul VoicePicker)", () => {
  const all = { gender: "all", pitch: "all", accent: "" } as const;
  it("lists only the member's language, everyday accent first", () => {
    const ko = voiceChoices("ko-KR", all);
    expect(ko).toHaveLength(VOICES.filter((v) => v.locale === "ko-KR").length);
    expect(ko.every((v) => v.locale === "ko-KR")).toBe(true);
    expect(ko[0]!.accent).toBe(mainAccent("ko-KR"));
    expect(voiceChoices("*", all)).toHaveLength(30);
  });
  it("narrows by gender, pitch and accent, and says so when nothing fits", () => {
    const f = voiceChoices("en-US", { gender: "f", pitch: 1, accent: "" });
    expect(f.length).toBeGreaterThan(0);
    expect(f.every((v) => v.gender === "f" && v.pitch === 1)).toBe(true);
    const acc = otherAccents("ko-KR")[0]!;
    expect(voiceChoices("ko-KR", { ...all, accent: acc }).every((v) => v.accent === acc)).toBe(true);
    expect(voiceChoices("ko-KR", { ...all, accent: "No Such Accent" })).toEqual([]);
  });
  it("saves the pick where voice mode reads it", async () => {
    expect(VOICE_ID_KEY).toBe("uc_voice_id");
    const { readFileSync } = await import("node:fs");
    expect(readFileSync("components/Chat.tsx", "utf8")).toContain(`id: "${VOICE_ID_KEY}"`);
    const picker = readFileSync("components/VoicePicker.tsx", "utf8");
    expect(picker).toContain("localStorage.setItem(VOICE_ID_KEY");
    expect(picker).toContain("why === null ? <button type=\"button\" onClick={() => listen(v.id)}");   // ▶ Listen only while the natural voice can be used
    expect(readFileSync("components/Settings.tsx", "utf8")).toContain("<VoicePicker lang={lang} />");
  });
});
