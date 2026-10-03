import { describe, expect, it } from "vitest";
import { appLinks, wrongLinks } from "@/lib/claim-check";

describe("answer claim check — app links against the builds record", () => {
  it("finds app links with or without https, once each, host only", () => {
    expect(appLinks("Your app is live: https://Tip-Calc-ab12.vercel.app/ and tip-calc-ab12.vercel.app")).toEqual(["tip-calc-ab12.vercel.app"]);
    expect(appLinks("Online now → https://quiz-x9.vercel.app?x=1.")).toEqual(["quiz-x9.vercel.app"]);
    expect(appLinks("It is at quiz-x9.vercel.app.")).toEqual(["quiz-x9.vercel.app"]);
    expect(appLinks("see https://vercel.app or https://example.com or myvercel.app.example.com")).toEqual([]);
  });
  it("a finished build's link passes; a made-up one and an unfinished one are flagged", () => {
    const builds = [
      { url: "https://tip-calc-ab12.vercel.app", status: "done" },
      { url: "https://quiz-x9.vercel.app", status: "failed" },
      { url: "https://quiz-x9.vercel.app", status: "running" },
    ];
    expect(wrongLinks(["tip-calc-ab12.vercel.app"], builds)).toEqual([]);
    expect(wrongLinks(["quiz-x9.vercel.app", "made-up.vercel.app"], builds)).toEqual([{ host: "quiz-x9.vercel.app", why: "unfinished" }, { host: "made-up.vercel.app", why: "unknown" }]);
    expect(wrongLinks(["quiz-x9.vercel.app"], [...builds, { url: "https://quiz-x9.vercel.app/", status: "done" }])).toEqual([]);   // built again later: a done one counts
    expect(wrongLinks(["a.vercel.app"], [])).toEqual([{ host: "a.vercel.app", why: "unknown" }]);
  });
});
