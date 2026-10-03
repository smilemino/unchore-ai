import { trFor } from "@/lib/i18n-server";
import { describe, expect, it } from "vitest";
import { PICKS, callName, guessFace, readPicks, onboardingGuide } from "../lib/face";
import { decide, logLine, nudgePrompt, readNudgeMarks, scheduleFor, markNote, type Signals } from "../lib/nudge";
import { validSchedule } from "../lib/schedule";

const DAY = 86_400_000;
const NOW = Date.parse("2026-10-10T00:00:00Z");
const base: Signals = { level: 3, at: "08:00", now: NOW, replied: [], replyChars: [], replyHours: [], onboardedAt: NOW - 10 * DAY, changedAt: null, askedMoveAt: null, askedMoreAt: null };

describe("first chat — who is this?", () => {
  it("the seven picks map to faces (health, money and «list all my work» don't pin one)", () => {
    expect(PICKS).toHaveLength(7);
    expect(guessFace("Let me list all my work — sort it for me")).toBeNull();
    expect(guessFace("공부하고 있어요", trFor("ko"))).toBe("student");   // the button as a Korean screen shows it
    expect(guessFace("Running a shop or business")).toBe("shop");
    expect(guessFace("건강·가족을 챙겨요", trFor("ko"))).toBeNull();
  });
  it("words in the first messages", () => {
    expect(guessFace("I deploy a SaaS on GitHub")).toBe("builder");
    expect(guessFace("손주 생일이 다음 주예요")).toBe("senior");
    expect(guessFace("내일 시험이 두 개예요")).toBe("student");
    expect(guessFace("회의가 너무 많아요")).toBe("worker");
    expect(guessFace("hello there")).toBeNull();
  });
  it("pick buttons come out of the answer; text stays readable", () => {
    const r = readPicks("What do you want first?\n\n<<<pick>>>\n- Morning weather\n2. Price watch\n* News brief\n<<<end>>>");
    expect(r.text).toBe("What do you want first?");
    expect(r.picks).toEqual(["Morning weather", "Price watch", "News brief"]);
    expect(readPicks("no block").picks).toEqual([]);
    expect(readPicks("half\n<<<pick>>>\n- a\n- b").picks).toEqual(["a", "b"]);   // still streaming
  });
  it("step 1 «what should I call you?» keeps the name alone", () => {
    expect(callName("지훈", "ko")).toBe("지훈");
    expect(callName("지훈님", "ko")).toBe("지훈");
    expect(callName("지훈이라고 불러 주세요", "ko")).toBe("지훈");
    expect(callName("선생님으로 불러줘", "ko")).toBe("선생");
    expect(callName("저는 지수예요", "ko")).toBe("지수");
    expect(callName("Call me Sam.", "en")).toBe("Sam");
    expect(callName("Dr. Kim", "en")).toBe("Dr. Kim");
    expect(callName("I don't care, just help me find cheap flights to Tokyo", "en")).toBeNull();   // a sentence → the AI takes it
    expect(callName("  ", "en")).toBeNull();
    expect(callName("Llámame Sam", "es", /(?<![\p{L}])llámame/giu)).toBe("Sam");   // other languages: the words from lib/words/name_words.json
    expect(callName("サムと呼んでください", "ja", /と呼んでください/giu)).toBe("サム");
  });
  it("the first-chat guide promises the note at the user's time", () => {
    expect(onboardingGuide("en", "07:30")).toContain("07:30");
  });
});

describe("daily note — words and schedules", () => {
  it("marks the AI writes when the user asks", () => {
    const r = readNudgeMarks("Sure, done.\n<<<nudge at=21:00>>>");
    expect(r.text).toBe("Sure, done.");
    expect(r.marks).toEqual([{ kind: "at", at: "21:00" }]);
    expect(readNudgeMarks("ok <<<nudge off>>>").marks).toEqual([{ kind: "off" }]);
    expect(readNudgeMarks("<<<nudge at=9:05>>>").marks).toEqual([{ kind: "at", at: "09:05" }]);
    expect(readNudgeMarks("<<<nudge at=25:00>>>").marks).toEqual([]);
    expect(markNote({ kind: "at", at: "21:00" }, "ko")).toContain("21:00");
  });
  it("every level is a schedule the scheduler understands", () => {
    for (let l = 1; l <= 5; l++) expect(validSchedule(scheduleFor(l, "08:30"))).toBe(true);
    expect(scheduleFor(3, "08:30")).toBe("daily@08:30");
    expect(scheduleFor(3, "bad")).toBe("daily@08:00");
  });
  it("tomorrow's prompt carries tonight's idea and the one-time questions", () => {
    const p = nudgePrompt({ idea: "Daily BTC price at 9", askMove: "21:00", askMore: true });
    expect(p).toContain("Daily BTC price at 9");
    expect(p).toContain("<<<nudge at=21:00>>>");
    expect(p).toContain("<<<nudge more>>>");
    expect(nudgePrompt({})).toContain("skip");
    expect(nudgePrompt({})).not.toContain("app's own log");
  });
  it("the day's log: one line of what Unchore did, nothing when it did nothing", () => {
    expect(logLine({ answers: 0, chats: 0, runs: [], added: [] })).toBeNull();
    expect(logLine({ answers: 1, chats: 1, runs: [], added: [] })).toBe("answered 1 message in 1 chat");
    const line = logLine({ answers: 6, chats: 2, runs: [{ title: "BTC price", ok: 2, failed: 1 }, { title: "Morning brief", ok: 1, failed: 0 }], added: ["Weekly   summary"] })!;
    expect(line).toBe("answered 6 messages in 2 chats · ran «BTC price» ×3 (1 failed), «Morning brief» · set up «Weekly summary»");
    expect(logLine({ answers: 0, chats: 0, runs: [1, 2, 3, 4, 5].map((i) => ({ title: `r${i}`, ok: 1, failed: 0 })), added: [] })).toContain("+1 more");
    expect(nudgePrompt({ log: line })).toContain("«BTC price» ×3 (1 failed)");
  });
});

describe("daily note — learning", () => {
  it("two silent notes in a row → quietly less (never off)", () => {
    expect(decide({ ...base, replied: [true, false, false] }).level).toBe(2);
    expect(decide({ ...base, level: 1, replied: [false, false] }).level).toBeUndefined();
  });
  it("at most one change per 3 days", () => {
    expect(decide({ ...base, replied: [false, false], changedAt: NOW - DAY }).level).toBeUndefined();
  });
  it("five real replies in a row → ask once for more, not more by itself", () => {
    const d = decide({ ...base, replied: [true, true, true, true, true], replyChars: [40, 30, 50, 60, 30] });
    expect(d.askMore).toBe(true);
    expect(d.level).toBeUndefined();
    expect(decide({ ...base, replied: [true, true, true, true, true], replyChars: [2, 2, 2, 2, 2] }).askMore).toBeUndefined();   // «ㅇㅇ» isn't enthusiasm
    expect(decide({ ...base, replied: [true, true, true, true, true], replyChars: [40, 40, 40, 40, 40], askedMoreAt: NOW - 5 * DAY }).askMore).toBeUndefined();
  });
  it("they write around 9pm → after a week, ask once to move", () => {
    const hours = [21, 21, 21, 22, 21, 20, 21, 9, 21, 13];
    expect(decide({ ...base, replyHours: hours }).askMove).toBe("21:00");
    expect(decide({ ...base, replyHours: hours, onboardedAt: NOW - 3 * DAY }).askMove).toBeUndefined();
    expect(decide({ ...base, replyHours: hours, askedMoveAt: NOW - 10 * DAY }).askMove).toBeUndefined();
    expect(decide({ ...base, replyHours: [8, 8, 9, 8, 7, 8, 8, 8] }).askMove).toBeUndefined();   // already about right
    expect(decide({ ...base, replyHours: [2, 2, 2, 2, 2, 2, 2, 2] }).askMove).toBeUndefined();   // never move a note into the night
  });
  it("off stays off", () => {
    expect(decide({ ...base, level: 0, replied: [false, false] })).toEqual({});
  });
});

describe("Jev (OpenRouter decisions) — cheap judge, never blocks", () => {
  it("asks Jev on the member's own OpenRouter key, else on Unchore's house key; UNCHORE_JEV_HOUSE=off turns the house key off", async () => {
    const { jevKeyFor } = await import("../lib/jev");
    const was = { h: process.env.UNCHORE_HOUSE_OPENROUTER_KEY, o: process.env.UNCHORE_JEV_HOUSE };
    try {
      process.env.UNCHORE_HOUSE_OPENROUTER_KEY = "sk-house"; delete process.env.UNCHORE_JEV_HOUSE;
      expect(jevKeyFor("sk-member")).toBe("sk-member");
      expect(jevKeyFor(undefined)).toBe("sk-house");
      process.env.UNCHORE_JEV_HOUSE = "off";
      expect(jevKeyFor(null)).toBe("");
      delete process.env.UNCHORE_JEV_HOUSE; delete process.env.UNCHORE_HOUSE_OPENROUTER_KEY;
      expect(jevKeyFor(undefined)).toBe("");
    } finally {
      if (was.h === undefined) delete process.env.UNCHORE_HOUSE_OPENROUTER_KEY; else process.env.UNCHORE_HOUSE_OPENROUTER_KEY = was.h;
      if (was.o === undefined) delete process.env.UNCHORE_JEV_HOUSE; else process.env.UNCHORE_JEV_HOUSE = was.o;
    }
  });
  it("strong/fast and face from Jev's answer; unsure → strong; low-confidence face → none; errors and hangs → null", async () => {
    const { jevNeedsStrong, jevFace, jevAsk } = await import("../lib/jev");
    const real = globalThis.fetch;
    const reply = (answers: unknown) => (async () => new Response(JSON.stringify({ answers }), { status: 200 })) as typeof fetch;
    try {
      globalThis.fetch = reply({ depth: { choice: "fast", confidence: 0.95 } });
      expect(await jevNeedsStrong("k", "hi")).toBe(false);
      globalThis.fetch = reply({ depth: { choice: "fast", confidence: 0.4 } });
      expect(await jevNeedsStrong("k", "hmm")).toBe(true);
      globalThis.fetch = reply({ face: { choice: "shop", confidence: 1 } });
      expect(await jevFace("k", "I run a cafe", ["student", "shop", "general"])).toBe("shop");
      globalThis.fetch = reply({ face: { choice: "shop", confidence: 0.5 } });
      expect(await jevFace("k", "hm", ["student", "shop", "general"])).toBeNull();
      globalThis.fetch = (async () => new Response("no", { status: 402 })) as typeof fetch;
      expect(await jevNeedsStrong("k", "x")).toBeNull();
      globalThis.fetch = (() => new Promise(() => {})) as typeof fetch;   // hangs forever
      const t0 = Date.now();
      expect(await jevAsk("k", {}, {}, 50)).toBeNull();
      expect(Date.now() - t0).toBeLessThan(1000);
    } finally { globalThis.fetch = real; }
  });
});

describe("satisfaction numbers per face (owners' nightly mail)", () => {
  it("members, first chat done, first automation (median minutes), back after 7 days, daily note off", async () => {
    const { faceRows } = await import("../lib/metrics");
    const D = 86_400_000, now = Date.parse("2026-11-01T00:00:00Z"), t0 = now - 20 * D;
    const members = [
      { id: "a", face: "shop", created: t0, onboarded: t0 + 60_000, noteLevel: 3 },
      { id: "b", face: "shop", created: t0, onboarded: t0 + 60_000, noteLevel: 0 },
      { id: "c", face: "shop", created: t0, onboarded: null, noteLevel: 3 },
      { id: "d", face: null, created: now - D, onboarded: null, noteLevel: 3 },
    ];
    const ev = new Map([
      ["a", [{ kind: "automation_from_offer", at: t0 + 4 * 60_000 }, { kind: "turn", at: t0 + 8 * D }]],
      ["b", [{ kind: "automation_manual", at: t0 + 10 * 60_000 }, { kind: "turn", at: t0 + D }]],
    ]);
    const rows = faceRows(members, ev, now);
    expect(rows[0]).toEqual({ face: "shop", members: 3, onboarded: 2, firstAutoMin: 7, auto10: "2/3 (67%)", back7: "1/2 (50%)", noteOff: 1 });
    expect(rows[1]).toMatchObject({ face: "(not yet)", members: 1, firstAutoMin: null, auto10: "0/1 (0%)", back7: "—" });
  });
});
