import { describe, expect, it } from "vitest";
import { priceLine } from "../lib/reminders";

// Night 2026-10-03: the AI wrote a drop alert as «…218,990원보다 낮으면 알려 주세요 … 218,990원 이상이면 아무것도 보내지 않아요».
// The silent clause was read as the line («above»), so the app would have stayed silent exactly when the price dropped.
describe("price line in a reminder task", () => {
  it("reads «N보다 낮으면» and skips the «stay silent» sentence", () => {
    const p = "다나와에서 \"에어팟 프로 2 USB-C (MTJV3KH/A)\" 정품 최저가를 확인합니다. 해외구매와 라이트닝 모델은 빼요. 정품 최저가가 218,990원보다 낮으면 지우님께 알려 주세요. 오늘 최저가, 기준선보다 얼마나 내려갔는지(원과 %), 가장 싸게 파는 쇼핑몰 이름을 함께 적어요. 218,990원 이상이면 아무것도 보내지 않아요.";
    expect(priceLine(p)).toEqual({ kind: "below", value: 218990 });
  });
  it("English: the «at or above → quiet» sentence first doesn't flip a «below» alert", () => {
    const p = "Read the current Bitcoin price in USD from a live source. If the price is at or above $82,000, answer with only <<<quiet>>>. If it is below $82,000, tell Sam the current price.";
    expect(priceLine(p)).toEqual({ kind: "below", value: 82000 });
  });
  it("«N보다 높으면» is above", () => {
    expect(priceLine("달러 환율이 1,400원보다 높으면 알려 주세요.")).toEqual({ kind: "above", value: 1400 });
  });
  it("the plain forms still read as before", () => {
    expect(priceLine("비트코인이 50,000달러 아래로 떨어지면 알려 줘")).toEqual({ kind: "below", value: 50000 });
    expect(priceLine("Tell me when Bitcoin drops below 90,000 USD")).toEqual({ kind: "below", value: 90000 });
    expect(priceLine("환율 1,400원 넘으면")).toEqual({ kind: "above", value: 1400 });
  });
});
