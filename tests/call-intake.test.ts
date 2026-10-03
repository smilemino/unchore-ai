// Calls → requests (lib/call-intake.ts · app/api/calls): file names, today's minutes, the first «since», what is kept from the
// AI's sorting, the note — and the terms the owner set (off by default, consent, sound deleted, own key, nothing to the caller).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CALL_SLOTS, DAY_SECONDS, ONE_SECONDS, callBody, firstSince, isCallAudio, keepWords, localStamp, parseCallName, readCallSort, reserveFor, roomToday, slotNow } from "@/lib/call-intake";
import { LEGAL } from "@/lib/legal";

const src = (p: string) => readFileSync(p, "utf8");

describe("call recording file names", () => {
  it("Samsung «Call recording NAME_yymmdd_hhmmss» (and the Korean prefix)", () => {
    expect(parseCallName("Call recording Alex Kim_260930_101530.m4a")).toEqual({ who: "Alex Kim", at: "2026-09-30 10:15" });
    expect(parseCallName("통화 녹음 Mina_260101_090000.m4a")).toEqual({ who: "Mina", at: "2026-01-01 09:00" });
  });
  it("older «NAME_yyyymmddhhmmss», underscores in the name", () => {
    expect(parseCallName("Dr_Lee_20260930101530.amr")).toEqual({ who: "Dr Lee", at: "2026-09-30 10:15" });
  });
  it("unreadable → the name as it is, no time", () => {
    expect(parseCallName("voice 12.m4a")).toEqual({ who: "voice 12", at: null });
  });
  it("only sound files", () => {
    expect(isCallAudio("a.m4a", "")).toBe(true);
    expect(isCallAudio("a.bin", "audio/mpeg")).toBe(true);
    expect(isCallAudio("a.pdf", "application/pdf")).toBe(false);
  });
});

describe("60 minutes a day, 20 a recording", () => {
  it("a recording takes what it says it lasts, capped; unknown = 20 minutes", () => {
    expect(reserveFor(125.2)).toBe(126);
    expect(reserveFor(5000)).toBe(ONE_SECONDS);
    expect(reserveFor(undefined)).toBe(ONE_SECONDS);
    expect(reserveFor(0)).toBe(ONE_SECONDS);
  });
  it("over the day's 60 minutes → not today", () => {
    expect(DAY_SECONDS).toBe(3600);
    expect(roomToday(3000, 600)).toBe(true);
    expect(roomToday(3001, 600)).toBe(false);
  });
});

describe("times in the member's zone", () => {
  const t = Date.UTC(2026, 9, 2, 1, 30);   // 10:30 in Seoul, 21:30 the day before in New York
  it("stamp", () => {
    expect(localStamp(t, "Asia/Seoul")).toBe("2026-10-02 10:30");
    expect(localStamp(t, "America/New_York")).toBe("2026-10-01 21:30");
  });
  it("first time on: calls from yesterday 00:00", () => {
    expect(firstSince(t, "Asia/Seoul")).toBe("2026-10-01 00:00");
    expect(firstSince(t, "America/New_York")).toBe("2026-09-30 00:00");
  });
  it("sorted three times a day", () => {
    expect(CALL_SLOTS).toEqual([5, 11, 17]);
    expect(slotNow("UTC", Date.UTC(2026, 9, 2, 11, 5))).toBe(true);
    expect(slotNow("UTC", Date.UTC(2026, 9, 2, 12, 5))).toBe(false);
  });
});

describe("what is kept from the AI's sorting", () => {
  const raw = JSON.stringify({ title: "Delivery date", summary: "Supplier asked about the order.", requests: ["Send the invoice by Friday", "card number 4111 1111 1111 1111"], promises: ["Call back tomorrow"], watch: ["Asked to wire money to a new account"] });
  it("reads fenced JSON, drops sensitive lines", () => {
    const s = readCallSort("```json\n" + raw + "\n```")!;
    expect(s.title).toBe("Delivery date");
    expect(s.requests).toEqual(["Send the invoice by Friday"]);
    expect(s.promises).toEqual(["Call back tomorrow"]);
  });
  it("broken answer → nothing (the call waits)", () => {
    expect(readCallSort("sorry")).toBeNull();
    expect(readCallSort("{}")).toBeNull();
  });
  it("the note: requests and promises as to-dos, scam warning, then the words", () => {
    const b = callBody(readCallSort(raw)!, { who: "Alex", at: "2026-10-02 10:30" }, "[words]", "en");
    expect(b).toContain("📞 Alex · 2026-10-02 10:30");
    expect(b).toContain("- [ ] Send the invoice by Friday");
    expect(b).toContain("- [ ] Call back tomorrow");
    expect(b).toContain("may be a scam");
    expect(b.endsWith("[words]")).toBe(true);
  });
  it("card numbers are masked before the words are kept", () => {
    expect(keepWords("my card is 4111 1111 1111 1111 ok")).not.toContain("4111 1111 1111 1111");
  });
});

describe("the owner's terms", () => {
  const route = src("app/api/calls/route.ts"), lib = src("lib/call-intake.ts"), mig = src("db/migrations/044_call_intake.sql"), ui = src("components/Settings.tsx");
  it("① off by default; on only with the consent tick, after the notice", () => {
    expect(mig).toMatch(/call_intake_at timestamptz;/);   // no default → null = off
    expect(route).toMatch(/consent !== true\) return NextResponse\.json\(\{ error: "consent" \}/);
    expect(ui).toContain("In some countries and states their consent is required.");
    expect(ui).toMatch(/disabled=\{!agree\}/);
  });
  it("④ the sound is deleted whatever happens; only locked words stay", () => {
    expect(route).toMatch(/finally \{ await drop\(\); \}/);
    expect(route).toMatch(/words = \$2[\s\S]*lock\(keepWords/);
    expect(mig).not.toMatch(/\bdata bytea\b/);
  });
  it("⑤ sorting only on the member's own key, nothing to the caller", () => {
    expect(lib).toMatch(/if \(!fm\) return 0;/);
    expect(lib).not.toMatch(/houseKey|charge\(/);
    expect(lib + route).not.toMatch(/sendMail|telegram|sms/i);
  });
  it("⑥ the privacy policy says so", () => {
    const p = LEGAL.privacy.body.join("\n");
    expect(p).toContain("the sound is deleted and only the text stays");
    expect(p).toContain("their consent is required");
  });
});
