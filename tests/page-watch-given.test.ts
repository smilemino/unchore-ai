import { describe, expect, it } from "vitest";
import { normalizePlan } from "../lib/pick";

// Night round 13: a page watch on an address the member never gave (invented ico.org) failed on its first read.
describe("page watch only on a page the member gave", () => {
  const plan = { title: "원두 시세", recipe: "page_watch", args: { url: "https://www.ico.org/coffee-prices", must_words: ["price"] }, schedule: "daily@08:00", condition: { kind: "changed" as const } };
  it("invented address → the safe brief instead", () => expect(normalizePlan(plan, "작은 카페를 해요. 원두 값이 자꾸 올라서 신경 쓰여요", "ko").recipe).toBe("ai_digest"));
  it("address the member gave → page watch", () => expect(normalizePlan(plan, "이 페이지 봐 줘 https://ico.org/coffee-prices 가격 바뀌면 알려 줘", "ko").recipe).toBe("page_watch"));
});
