import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HOW_TO_VIDEOS, howToVideosNewestFirst, videoFiles, type HowToVideo } from "@/lib/how-to-videos";
import { screenLinks } from "@/lib/screen-links";
import ko from "@/lib/locales/ko.json";

const v = (id: string, date: string): HowToVideo => ({ id, date, title: id, what: id, screen: "/app", langs: ["en"] });

describe("how-to videos — one list for the help page and tips", () => {
  it("lists newest first without reordering the list itself", () => {
    const list = [v("a", "2026-09-01"), v("c", "2026-10-02"), v("b", "2026-09-15")];
    expect(howToVideosNewestFirst(list).map((x) => x.id)).toEqual(["c", "b", "a"]);
    expect(list.map((x) => x.id)).toEqual(["a", "c", "b"]);
  });
  it("plays the member's language, English when there is no recording in it", () => {
    const pu = HOW_TO_VIDEOS.find((x) => x.id === "personal-ui")!;
    expect(videoFiles(pu, "ko").mp4).toBe("/help/personal-ui/ko.mp4");
    expect(videoFiles(pu, "ja")).toMatchObject({ lang: "en", webm: "/help/personal-ui/en.webm", captions: "/help/personal-ui/en.vtt" });
  });
  it("every video has its files, a unique id, a real date, an in-app screen and Korean words", () => {
    expect(new Set(HOW_TO_VIDEOS.map((x) => x.id)).size).toBe(HOW_TO_VIDEOS.length);
    for (const x of HOW_TO_VIDEOS) {
      expect(x.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(x.langs).toContain("en");
      expect(screenLinks(`[s](${x.screen})`)).toHaveLength(1);
      expect((ko as Record<string, string>)[x.title]).toBeTruthy();
      expect((ko as Record<string, string>)[x.what]).toBeTruthy();
      for (const l of x.langs) for (const f of Object.values(videoFiles(x, l)).slice(1)) expect(existsSync(join("public", f)), f).toBe(true);
    }
  });
  it("the AI's screen map can send members to the help page", () => {
    const src = readFileSync("lib/set-marks.ts", "utf8");
    expect(screenLinks(src.split("\n").find((l) => l.includes("Where things are"))!, 99).map((x) => x.href)).toContain("/app/help");
  });
});
