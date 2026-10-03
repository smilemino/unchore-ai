// Flight fares in the member's own currency — before, Google Flights Korea in won only, so only Korean members saw it (9ec392c).
import { afterEach, describe, expect, it, vi } from "vitest";
import { CANARIES, parseFare } from "../worker/recipes.mjs";
import { catalogText, getRecipe } from "@/lib/recipes";

describe("flight fare page text", () => {
  it("Korea page in won, as before", () => {
    expect(parseFare("항공편 최저가 ₩182,300 왕복", "KRW")).toMatchObject({ value: 182300 });
    expect(parseFare("₩95,000부터", "KRW")).toMatchObject({ value: 95000 });
  });
  it("reads the member's currency after «Cheapest» or «from»", () => {
    expect(parseFare("Best\n$612\nCheapest\n$498\n1 stop", "USD")).toMatchObject({ value: 498 });
    expect(parseFare("Round trip prices from €1,204.50", "EUR")).toMatchObject({ value: 1204.5 });
    expect(parseFare("Cheapest from ¥38,400", "JPY")).toMatchObject({ value: 38400 });
    expect(parseFare("Cheapest CA$730", "CAD")).toMatchObject({ value: 730, sym: "CA$" });
  });
  it("never reads a stop count, a date or another currency as the fare", () => {
    expect(parseFare("Flights from JFK · from 2 stops · Oct 14", "USD")).toBeNull();
    expect(parseFare("Cheapest €498", "USD")).toBeNull();
    expect(parseFare("최저가 ₩182,300", "USD")).toBeNull();
    expect(parseFare("Cheapest $498", "KRW")).toBeNull();
  });
});

describe("flight recipe for members outside Korea", () => {
  afterEach(() => vi.unstubAllEnvs());
  const us = { lang: "en" as const, tz: "America/New_York" };
  it("takes a currency", () => {
    const r = getRecipe("google_flights")!;
    expect(r.args.safeParse({ frm: "JFK", to: "LHR", date: "2026-11-20", ret: null, curr: "USD" }).success).toBe(true);
    expect(r.args.safeParse({ frm: "GMP", to: "CJU", date: "2026-11-20" }).success).toBe(true);
    expect(r.args.safeParse({ frm: "JFK", to: "LHR", date: "2026-11-20", curr: "dollars" }).success).toBe(false);
  });
  it("stays closed until its worldwide check passed and the switch is on", () => {
    expect(catalogText(us)).not.toContain("google_flights");
    vi.stubEnv("FLIGHTS_WORLD", "1");
    expect(catalogText(us)).toContain("google_flights");
    expect(catalogText(us)).not.toContain("danawa_lowest");
  });
  it("is checked every night in another currency, on a date that never goes stale", () => {
    const c = CANARIES.find((x) => x[2] === "google_flights_world")!;
    const args = (c[1] as () => { curr: string; date: string })();
    expect(args.curr).toBe("USD");
    expect(Date.parse(args.date)).toBeGreaterThan(Date.now());
  });
});
