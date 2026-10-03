import { trFor } from "@/lib/i18n-server";
import { describe, expect, it } from "vitest";
import { hint, open, seal } from "@/lib/crypto";
import { describeSchedule, nextRun, validSchedule } from "@/lib/schedule";
import { normalizePlan } from "@/lib/pick";
import { shouldNotify } from "@/lib/automation";
import { systemPrompt, PLANNING_GUIDE, ANSWER_GUIDE, ASKING_GUIDE, CARE_GUIDE, JUDGMENT_GUIDE, WRITING_GUIDE } from "@/lib/persona";
import { firstJson, providerOf, chooseModel } from "@/lib/ai";
import { htmlToText } from "@/lib/recipes/util";

describe("crypto", () => {
  it("seals and opens", () => {
    const b = seal("sk-ant-secret-1234");
    expect(b).not.toContain("secret");
    expect(open(b)).toBe("sk-ant-secret-1234");
  });
  it("detects tampering", () => {
    const b = seal("x");
    const parts = b.split(".");
    parts[3] = Buffer.from("y").toString("base64");
    expect(() => open(parts.join("."))).toThrow();
  });
  it("hints only the tail", () => expect(hint("sk-abcdef1234")).toBe("••••1234"));
});

describe("schedule", () => {
  it("validates", () => {
    expect(validSchedule("daily@08:00")).toBe(true);
    expect(validSchedule("weekly@1@09:30")).toBe(true);
    expect(validSchedule("every:6h")).toBe(true);
    expect(validSchedule("daily@25:00")).toBe(false);
    expect(validSchedule("rm -rf")).toBe(false);
  });
  it("daily 08:00 Seoul is 23:00 UTC the day before", () => {
    const from = new Date("2026-09-29T00:30:00Z"); // 09:30 KST
    expect(nextRun("daily@08:00", "Asia/Seoul", from).toISOString()).toBe("2026-09-29T23:00:00.000Z");
  });
  it("same day if still ahead", () => {
    const from = new Date("2026-09-28T22:00:00Z"); // 07:00 KST
    expect(nextRun("daily@08:00", "Asia/Seoul", from).toISOString()).toBe("2026-09-28T23:00:00.000Z");
  });
  it("weekly Monday", () => {
    const from = new Date("2026-09-29T00:00:00Z"); // Tue 09:00 KST
    expect(nextRun("weekly@1@09:00", "Asia/Seoul", from).toISOString()).toBe("2026-10-05T00:00:00.000Z");
  });
  it("handles DST (New York)", () => {
    // 2026-10-31 09:00 EDT → next 08:00 is on 11-01, after DST ended (EST, UTC-5) → 13:00Z, not 12:00Z
    const from = new Date("2026-10-31T13:00:00Z");
    expect(nextRun("daily@08:00", "America/New_York", from).toISOString()).toBe("2026-11-01T13:00:00.000Z");
  });
  it("describes", () => expect(describeSchedule("daily@08:00", { lang: "ko", t: trFor("ko") })).toBe("매일 08:00"));
});

describe("plan", () => {
  it("keeps a valid plan", () => {
    const p = normalizePlan({ title: "BTC", recipe: "crypto", args: { coin: "BTC", vs: "KRW" }, schedule: "daily@09:00", condition: { kind: "below", value: 100 } }, "q", "en");
    expect(p.recipe).toBe("crypto");
    expect(p.condition).toEqual({ kind: "below", value: 100 });
  });
  it("falls back to an AI brief when arguments are wrong", () => {
    const p = normalizePlan({ recipe: "fx", args: { from: "dollars" } }, "Plan my workouts", "en");
    expect(p.recipe).toBe("ai_digest");
    expect(p.args).toEqual({ prompt: "Plan my workouts" });
  });
  it("drops a price condition without a number", () => {
    const p = normalizePlan({ recipe: "fx", args: { from: "USD", to: "KRW" }, condition: { kind: "below" }, schedule: "nope" }, "q", "en");
    expect(p.condition).toEqual({ kind: "always" });
    expect(p.schedule).toBe("daily@08:00");
  });
  it("unknown recipe falls back", () => expect(normalizePlan({ recipe: "hack" }, "q", "en").recipe).toBe("ai_digest"));
});

describe("notify rules", () => {
  const ok = (value: number, line = "x") => ({ ok: true as const, value, line });
  it("below", () => {
    expect(shouldNotify({ kind: "below", value: 100 }, ok(99), null)).toBe(true);
    expect(shouldNotify({ kind: "below", value: 100 }, ok(100), null)).toBe(false);
  });
  it("changed", () => {
    expect(shouldNotify({ kind: "changed" }, ok(1, "a"), "a")).toBe(false);
    expect(shouldNotify({ kind: "changed" }, ok(1, "b"), "a")).toBe(true);
  });
  it("never on failure", () => expect(shouldNotify({ kind: "always" }, { ok: false, why: "x" }, null)).toBe(false));
});

describe("ai helpers", () => {
  it("routes models", () => {
    expect(providerOf("claude-sonnet-5")).toBe("anthropic");
    expect(providerOf("gpt-6-sol")).toBe("openai");
    expect(providerOf("anthropic/claude-sonnet-5")).toBe("openrouter");
  });
  it("chooses a model with a key", () => {
    expect(chooseModel({ openai: "k" }, "claude-sonnet-5")).toBe("gpt-6-sol");
    expect(chooseModel({}, null)).toBe(null);
  });
  it("parses fenced JSON", () => expect(firstJson<{ a: number }>('```json\n{"a":1}\n```')).toEqual({ a: 1 }));
});

describe("html", () => {
  it("strips scripts and tags", () => {
    expect(htmlToText("<script>x()</script><p>Hello&nbsp;<b>world</b></p><div>2</div>")).toBe("Hello world\n2");
  });
});

describe("planning together (2026-09-29)", () => {
  it("every chat carries the app-planning flow: one question at a time, four owner questions, seven-part plan", () => {
    const sp = systemPrompt("ko", "Asia/Seoul");
    expect(sp).toContain(PLANNING_GUIDE);
    expect(PLANNING_GUIDE).toMatch(/ONE question/);
    expect(PLANNING_GUIDE).toMatch(/what NOT to build/);
    expect(PLANNING_GUIDE).toMatch(/⑦/);
  });
});

describe("the rest of the Soul guidelines (2026-09-29)", () => {
  it("every chat carries answer shape, when to ask, money care, judgment and outgoing-writing rules", () => {
    const sp = systemPrompt("en", "America/New_York", { webSearch: true });
    for (const g of [ANSWER_GUIDE, ASKING_GUIDE, CARE_GUIDE, JUDGMENT_GUIDE, WRITING_GUIDE]) expect(sp).toContain(g);
    expect(CARE_GUIDE).toMatch(/May I make this payment\?/);
    expect(ASKING_GUIDE).toMatch(/BOTH are true/);
    expect(sp).toMatch(/Option 1 is wrong if/);
    expect(sp).toMatch(/Never put the user's personal or company details/);
    expect(sp).toMatch(/Only promise to follow up/);
  });
  it("keeps company-only Soul rules out", () => {
    const sp = systemPrompt("ko", "Asia/Seoul");
    for (const w of ["리링몰", "Rlink", "detach-job", "telegram", "bot team"]) expect(sp).not.toContain(w);
  });
});
