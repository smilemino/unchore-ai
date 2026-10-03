import { describe, expect, it } from "vitest";
import { reportSpeech } from "@/lib/voice/announce";
import { voiceGuide } from "@/lib/voice/marker";

// A job left running from voice mode: its whole report is read aloud, not one sentence (AI Soul f5febae).
describe("report read in full", () => {
  it("keeps every line and item, each ending as a sentence", () => {
    const md = "## Done\nI checked three shops.\n\n- Shop A is open until 9\n- Shop B is closed on Sunday\n1. Shop C delivers";
    expect(reportSpeech(md)).toBe("Done.\nI checked three shops.\nShop A is open until 9.\nShop B is closed on Sunday.\nShop C delivers.");
  });
  it("leaves out code, links, app marks and table rules; reads a table row as a list", () => {
    const md = "Your app is ready: https://uc-x.vercel.app\n```js\nx()\n```\n| Name | Price |\n|---|---:|\n| Tea | 3 |\n---\nSee [the page](https://a.b) <<<nudge at=9>>>";
    expect(reportSpeech(md)).toBe("Your app is ready:\nName, Price.\nTea, 3.\nSee the page.");
  });
  it("is not cut to one sentence, only at a far limit on a word", () => {
    const long = Array.from({ length: 50 }, (_, i) => `Point ${i} is here.`).join(" ");
    expect(reportSpeech(long)).toBe(long);
    const cut = reportSpeech("word ".repeat(100), 42);
    expect(cut.endsWith("word…")).toBe(true);
    expect(cut.length).toBeLessThanOrEqual(43);
  });
  it("has nothing to read for an empty or link-only report", () => {
    expect(reportSpeech("")).toBe("");
    expect(reportSpeech("https://only.link")).toBe("");
  });
});

describe("voice guide", () => {
  const g = voiceGuide({ lang: "en", current: "" }, []);
  it("no longer caps an asked-for explanation or report at three sentences", () => {
    expect(g).not.toMatch(/one to three sentences/);
    expect(g).toMatch(/said in full/);
  });
  it("answers a follow-up from a finished job's report instead of starting it again", () => {
    expect(g).toMatch(/answer from that message at once; don't start the job again/);
  });
});
