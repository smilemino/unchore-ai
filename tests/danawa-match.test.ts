// Night 2026-10-01 round 14: the Danawa reader found nothing when the AI wrote the product its own way, and took a single earbud as «the lowest».
import { describe, expect, it } from "vitest";
import { has, pickLowest } from "../worker/recipes.mjs";

const PAGE: [string, string][] = [
  ["APPLE 에어팟 프로2 맥세이프 USB-C 이어버드 단품", "114,120원"],
  ["APPLE 에어팟 프로2 맥세이프 USB-C MTJV3KH/A", "316,690원"],
  ["APPLE 에어팟 프로2 맥세이프 라이트닝 MQD83KH/A", "318,190원"],
  ["에어팟 프로2 실리콘 케이스", "9,900원"],
];

describe("Danawa matching", () => {
  it("finds the product however the words are written", () => {
    for (const w of [["에어팟", "프로2", "USB-C"], ["에어팟", "프로 2", "USB C"], ["에어팟 프로 2", "USBC"], ["에어팟프로2", "C타입"], ["AirPods Pro 2", "USB-C"]]) {
      expect(pickLowest(PAGE, w, 100000)[0]?.[1], JSON.stringify(w)).toBe("APPLE 에어팟 프로2 맥세이프 USB-C MTJV3KH/A");
    }
  });
  it("skips a single earbud and cases, unless asked for", () => {
    expect(pickLowest(PAGE, ["에어팟", "프로2"], 0)[0]?.[0]).toBe(316690);
    expect(pickLowest(PAGE, ["에어팟", "프로2", "이어버드 단품"], 0)[0]?.[0]).toBe(114120);
  });
  it("still needs every word", () => {
    expect(has("라이트닝", "APPLE 에어팟 프로2 맥세이프 USB-C MTJV3KH/A")).toBe(false);
    expect(pickLowest(PAGE, ["에어팟", "프로3"], 0)).toEqual([]);
  });
});
