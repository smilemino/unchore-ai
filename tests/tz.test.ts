import { describe, expect, it } from "vitest";
import { signupTz, validTz } from "@/lib/tz";

describe("new account time zone", () => {
  it("takes the browser's zone", () => {
    expect(signupTz("America/New_York", "en")).toBe("America/New_York");
    expect(signupTz("Europe/London", "ko")).toBe("Europe/London");
  });
  it("falls back to UTC, Seoul only for Korean", () => {
    expect(signupTz(null, "en")).toBe("UTC");
    expect(signupTz(undefined, "ko")).toBe("Asia/Seoul");
    expect(signupTz("Not/A_Zone", "en")).toBe("UTC");
  });
  it("rejects junk", () => {
    expect(validTz("'; drop table users;--")).toBeNull();
    expect(validTz("x".repeat(80))).toBeNull();
    expect(validTz("Asia/Seoul")).toBe("Asia/Seoul");
  });
});

describe("Korea-only recipes", () => {
  it("are offered only to Korean users", async () => {
    const { catalogText } = await import("@/lib/recipes");
    for (const who of [{ lang: "ko" as const, tz: "Asia/Seoul" }, { lang: "en" as const, tz: "Asia/Seoul" }]) expect(catalogText(who)).toContain("danawa_lowest");
    const us = catalogText({ lang: "en", tz: "America/New_York" });
    for (const id of ["danawa_lowest", "stock_kr", "google_flights"]) expect(us).not.toContain(id);
    expect(us).toContain("weather");
  });
  it("legacy zone names still count as valid", () => {
    expect(validTz("EST5EDT")).toBe("EST5EDT");
    expect(validTz("UTC")).toBe("UTC");
  });
});

describe("memory never keeps phone numbers", () => {
  it("blocks US-style numbers too", async () => {
    const { blocked } = await import("@/lib/memory");
    expect(blocked("My number is 415-555-0123")).toContain("phone");
    expect(blocked("Call (415) 555-0123")).toContain("phone");
    expect(blocked("AirPods are 294,690 won")).not.toContain("phone");
  });
});

describe("«stop» in voice mode", () => {
  it("does not pause reminders unless reminders are named", async () => {
    const { askedStop } = await import("@/lib/reminders");
    expect(askedStop("그만", true)).toBe(false);
    expect(askedStop("stop", true)).toBe(false);
    expect(askedStop("예약 그만", true)).toBe(true);
    expect(askedStop("stop my reminders", true)).toBe(true);
    expect(askedStop("그만")).toBe(true);
    expect(askedStop("stop")).toBe(true);
  });
});

describe("members' nightly look-back runs at 04:00 local time", () => {
  it("knows the local hour", async () => {
    const { localHour } = await import("@/lib/nudge");
    const t = Date.parse("2026-09-30T19:00:00Z");   // 04:00 Seoul · 15:00 New York
    expect(localHour("Asia/Seoul", t)).toBe(4);
    expect(localHour("America/New_York", t)).toBe(15);
    expect(localHour("Not/AZone", t)).toBe(19);
  });
});
