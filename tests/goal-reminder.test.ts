import { describe, expect, it } from "vitest";
import { goalFor, goalOf, priceLine, remindersGuide, triedBefore, triedOf } from "../lib/reminders";

// AI Soul build-log «goals» (2026-10-02): a goal reminder records one web-searched method per missed run and never repeats it.
describe("goal reminders", () => {
  it("reads the goal line from the reminder text", () => {
    expect(goalOf("title: Threads views\ngoal: views per post 1000\ncheck yesterday's post")).toBe("views per post 1000");
    expect(goalOf("check the dollar rate")).toBeNull();
  });
  it("reads the «Tried:» line only with a source link", () => {
    expect(triedOf("Below goal.\nTried: open with a question | https://example.com/a", "2026-10-02")).toEqual({ at: "2026-10-02", what: "open with a question", src: "https://example.com/a" });
    expect(triedOf("Tried: open with a question", "2026-10-02")).toBeNull();
  });
  it("treats the same method as already tried unless marked «Again:»", () => {
    const list = [{ at: "2026-10-01", what: "Open with a question", src: "https://x.y" }];
    expect(triedBefore(list, { at: "2026-10-02", what: "open  with a question", src: "https://z" })).toBe(true);
    expect(triedBefore(list, { at: "2026-10-02", what: "Again: open with a question", src: "https://z" })).toBe(false);
    expect(triedBefore(list, { at: "2026-10-02", what: "post at 8am", src: "https://z" })).toBe(false);
  });
  it("tells the AI how to set one", () => {
    expect(remindersGuide()).toContain("goal: <what is measured> <target>");
  });
  // Night 2026-10-03: a chat price alert came out as «goal: Bitcoin price (USD) below 82000» — once crossed it would have run as a goal reminder.
  it("a price line the app watches itself is never a goal reminder", () => {
    expect(goalFor("goal: Bitcoin price (USD) below 82000\nRead the current Bitcoin price", true)).toBeNull();
    expect(goalFor("title: Threads views\ngoal: views per post 1000", false)).toBe("views per post 1000");
    expect(remindersGuide()).toContain("never for a price, rate or other value they only watch");
  });
  // Same night: «최저가 떨어지면 알려 주세요» had no number → no line → the member's AI was asked every hour for 30 days.
  it("a drop alert written with today's value as its line can be watched without the AI", () => {
    expect(priceLine("다나와에서 에어팟 프로 2 최저가를 확인한다. 최저가가 218,990원 아래로 떨어지면 새 가격을 알린다.")).toEqual({ kind: "below", value: 218990 });
    expect(remindersGuide()).toContain("use the current value you read as the line");
  });
});
