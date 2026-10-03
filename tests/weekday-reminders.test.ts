import { trFor } from "@/lib/i18n-server";
const ko = { lang: "ko" as const, t: trFor("ko") }, en = { lang: "en" as const, t: trFor("en") };
import { describe, expect, it } from "vitest";
import { checkSpec, extractReminders, toSchedule } from "../lib/reminders";
import { describeSchedule, nextRun, validSchedule } from "../lib/schedule";

// Night test 2026-09-30: «weekdays at 9» and «every Monday 8:30» became one-off reminders; «every day» stopped after 7 days.
describe("weekday reminders (days@…)", () => {
  it("the block is read and becomes a weekday schedule that keeps going", () => {
    const { proposals } = extractReminders("좋아요.\n<<<remind days=12345@09:00>>>\n고객 후속 연락 확인\n<<<end>>>");
    expect(proposals[0]).toMatchObject({ kind: "days", spec: "12345@09:00" });
    expect(checkSpec(proposals[0]!)).toBeNull();
    const now = new Date("2026-09-30T00:00:00Z");
    const s = toSchedule(proposals[0]!, "Asia/Seoul", now);
    expect(s.schedule).toBe("days@12345@09:00");
    expect(validSchedule(s.schedule)).toBe(true);
    expect(s.endsAt.getTime() - now.getTime()).toBe(365 * 86_400_000);
  });
  it("daily keeps going a year unless for= is given", () => {
    const now = new Date("2026-09-30T00:00:00Z");
    expect(toSchedule({ kind: "daily", spec: "8:00", forSpec: null, prompt: "x" }, "UTC", now).endsAt.getTime() - now.getTime()).toBe(365 * 86_400_000);
    expect(toSchedule({ kind: "daily", spec: "08:00", forSpec: "3d", prompt: "x" }, "UTC", now).endsAt.getTime() - now.getTime()).toBe(3 * 86_400_000);
  });
  it("bad days are refused", () => {
    expect(checkSpec({ kind: "days", spec: "78@09:00", forSpec: null, prompt: "x" })).toMatch(/bad days/);
    expect(checkSpec({ kind: "days", spec: "1@25:00", forSpec: null, prompt: "x" })).toMatch(/bad days/);
  });
  it("next run skips the weekend (Seoul)", () => {
    // Fri 2026-10-02 10:00 KST → next weekday 09:00 is Mon 2026-10-05 09:00 KST = 00:00Z
    expect(nextRun("days@12345@09:00", "Asia/Seoul", new Date("2026-10-02T01:00:00Z")).toISOString()).toBe("2026-10-05T00:00:00.000Z");
    expect(nextRun("days@1@08:30", "Asia/Seoul", new Date("2026-09-30T00:00:00Z")).toISOString()).toBe("2026-10-04T23:30:00.000Z");
  });
  it("reads well", () => {
    expect(describeSchedule("days@12345@09:00", ko)).toBe("평일 09:00");
    expect(describeSchedule("days@06@10:00", en)).toBe("weekends at 10:00");
    expect(describeSchedule("days@135@07:00", ko)).toBe("매주 월·수·금 07:00");
  });
});

import { reminderTitle } from "../lib/reminders";
// Night test 2026-09-30 round 8: the name on the phone notification was the AI's instruction («Remind the user to check… Do not claim…»).
describe("reminder title", () => {
  it("title line is read and kept out of the task", () => {
    const { proposals } = extractReminders("<<<remind daily=08:00>>>\n제목: 혈압약 알림\n사용자에게 아침 약을 드실 시간이라고 짧게 알려줘.\n<<<end>>>");
    expect(proposals[0]).toMatchObject({ title: "혈압약 알림", prompt: "사용자에게 아침 약을 드실 시간이라고 짧게 알려줘." });
    expect(reminderTitle(proposals[0]!)).toBe("혈압약 알림");
  });
  it("no title line → the task's first sentence, not the whole instruction", () => {
    const { proposals } = extractReminders("<<<remind days=12345@09:00>>>\nRemind the user to check client follow-ups. Do not claim to have checked anything.\n<<<end>>>");
    expect(reminderTitle(proposals[0]!)).toBe("Remind the user to check client follow-ups.");
  });
});

// Night round 11: a «tell me when it crosses X» reminder said «not yet» on every run — <<<quiet>>> keeps it silent.
describe("quiet reminder runs", () => {
  it("<<<quiet>>> is read and removed", () => {
    const r = extractReminders("<<<quiet>>>");
    expect(r).toMatchObject({ quiet: true, stop: false, content: "" });
    expect(extractReminders("비트코인이 $89,500로 내려갔어요.").quiet).toBe(false);
  });
});

import { crossed, priceLine } from "../lib/reminders";
// Night round 13: «tell me when it crosses X» reminders read the value themselves and call no AI until the line is crossed.
describe("priceLine — the line in a reminder's task", () => {
  it("reads Korean and English lines", () => {
    expect(priceLine("비트코인(BTC) 달러 가격이 50,000달러 아래로 떨어지면 알려 주세요.")).toEqual({ kind: "below", value: 50000 });
    expect(priceLine("달러 환율이 1,400원을 넘으면 알려 주세요.")).toEqual({ kind: "above", value: 1400 });
    expect(priceLine("Tell me when Bitcoin drops below $90,000")).toEqual({ kind: "below", value: 90000 });
    expect(priceLine("원두 1만원 이하로 떨어지면")).toEqual({ kind: "below", value: 10000 });
  });
  it("no line → nothing", () => {
    expect(priceLine("매일 아침 8시 혈압약 드실 시간이라고 알려줘")).toBeNull();
    expect(priceLine("Remind me every weekday at 9am to follow up")).toBeNull();
  });
  it("crossed", () => {
    expect(crossed({ kind: "below", value: 90000 }, 83500)).toBe(true);
    expect(crossed({ kind: "below", value: 50000 }, 83500)).toBe(false);
    expect(crossed({ kind: "above", value: 1400 }, 1353.36)).toBe(false);
  });
});
