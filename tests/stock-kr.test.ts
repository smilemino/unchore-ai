// Korean stock line says whether the market has closed, and when (night 2026-10-01).
import { describe, expect, it } from "vitest";
import { runRecipe } from "@/lib/recipes";

const fake = (body: object) => (async () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;

describe("stock_kr", () => {
  it("closed market → «close <date>»", async () => {
    const r = await runRecipe("stock_kr", { code: "005930" }, { lang: "ko", tz: "Asia/Seoul", fetch: fake({ stockName: "삼성전자", closePrice: "269,500", fluctuationsRatio: "-1.10", marketStatus: "CLOSE", localTradedAt: "2026-09-30T20:20:21+09:00" }) });
    expect(r).toMatchObject({ ok: true, value: 269500 });
    expect(r.ok && r.line).toBe("삼성전자 269,500원 (-1.10%, close 2026-09-30, Naver)");
  });
  it("trading → the Korean time of the last trade; no status → as before", async () => {
    const r = await runRecipe("stock_kr", { code: "005930" }, { lang: "ko", tz: "Asia/Seoul", fetch: fake({ stockName: "삼성전자", closePrice: "270,000", fluctuationsRatio: "0.19", marketStatus: "OPEN", localTradedAt: "2026-10-01T10:32:05+09:00" }) });
    expect(r.ok && r.line).toBe("삼성전자 270,000원 (0.19%, 10:32 KST, Naver)");
    const r2 = await runRecipe("stock_kr", { code: "005930" }, { lang: "ko", tz: "Asia/Seoul", fetch: fake({ stockName: "삼성전자", closePrice: "270,000", fluctuationsRatio: "0.19" }) });
    expect(r2.ok && r2.line).toBe("삼성전자 270,000원 (0.19%, Naver)");
  });
});
