// Recordings and YouTube links into words (lib/media-text.ts · worker/media.mjs · 2026-10-02 owner «don't say it can't»).
import { afterEach, describe, expect, it, vi } from "vitest";
import { GOOGLE_MODELS, freeTierOk, routes, youtubeLinks } from "@/lib/media-text";
import { vttText } from "../worker/media.mjs";

describe("recordings and YouTube into words", () => {
  it("finds YouTube links of every shape, once each, at most two", () => {
    const t = "봐 줘 https://youtu.be/dQw4w9WgXcQ?si=x 그리고 https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10 또 https://m.youtube.com/shorts/abcdefghijk 와 https://youtube.com/live/ZZZZZZZZZZZ";
    expect(youtubeLinks(t)).toEqual(["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://www.youtube.com/watch?v=abcdefghijk"]);
    expect(youtubeLinks("https://www.youtube.com/watch?feature=share&v=ABCDEFGHIJK")).toEqual(["https://www.youtube.com/watch?v=ABCDEFGHIJK"]);
    expect(youtubeLinks("no link here, and https://notyoutube.com/watch?v=ABCDEFGHIJK")).toEqual([]);
  });

  it("caption files become plain lines — no timings, tags or the rolling repeats of automatic captions", () => {
    const vtt = "WEBVTT\nKind: captions\nLanguage: ko\n\n00:00:00.000 --> 00:00:02.000\n<c>안녕하세요</c>\n\n00:00:01.000 --> 00:00:03.000\n안녕하세요\n오늘은 &amp; 빵 이야기\n";
    expect(vttText(vtt)).toBe("안녕하세요\n오늘은 & 빵 이야기");
  });

  describe("the free Gemini key goes first, never for Europe", () => {
    afterEach(() => vi.unstubAllEnvs());
    it("free tier: off in Europe, on elsewhere", () => {
      expect(freeTierOk("Europe/Berlin")).toBe(false);
      expect(freeTierOk("Europe/London")).toBe(false);
      expect(freeTierOk("Atlantic/Reykjavik")).toBe(false);
      expect(freeTierOk("Asia/Seoul")).toBe(true);
      expect(freeTierOk("America/New_York")).toBe(true);
      expect(freeTierOk(null)).toBe(true);
    });
    it("with the key set, a member with nothing connected still gets a free route; Europe doesn't", () => {
      vi.stubEnv("UNCHORE_GEMINI_FREE_KEY", "free-k");
      expect(routes({}, "m", "Asia/Seoul").map((r) => [r.key, r.paid])).toEqual(GOOGLE_MODELS.map(() => ["free-k", null]));
      expect(routes({}, "m", "Europe/Paris")).toEqual([]);
      expect([...new Set(routes({ gemini: "own" }, "m", "Asia/Seoul").map((r) => r.key))]).toEqual(["free-k", "own"]);
    });
    it("Google's own door: latest flash first, then two more for busy times — never the closed gemini-2.5-flash", () => {
      vi.stubEnv("UNCHORE_GEMINI_FREE_KEY", "free-k");
      const rs = routes({ gemini: "own" }, "m", "Asia/Seoul");
      expect(rs.filter((r) => r.key === "free-k").map((r) => r.model)).toEqual(["gemini-flash-latest", "gemini-3.5-flash", "gemini-flash-lite-latest"]);
      for (const r of rs) {
        expect(r.url).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${r.model}:generateContent`);
        expect(r.model).not.toContain("2.5");
      }
    });
    it("without the key nothing changes", () => {
      vi.stubEnv("UNCHORE_GEMINI_FREE_KEY", "");
      expect(routes({}, "m", "Asia/Seoul")).toEqual([]);
    });
  });
});
