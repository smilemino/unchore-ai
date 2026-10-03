import { describe, expect, it } from "vitest";
import { dayGroup, fileKind, humanSize } from "../lib/file-groups";

// Settings «Files» tab (owner 2026-10-03, with AI Soul): kind chips, «when» groups, sizes people read at a glance.
describe("file groups", () => {
  it("kind comes from the end of the name", () => {
    expect(fileKind("photo.JPG")).toBe("image");
    expect(fileKind("sales.xlsx")).toBe("sheet");
    expect(fileKind("list.csv")).toBe("sheet");
    expect(fileKind("contract.pdf")).toBe("doc");
    expect(fileKind("report.hwp")).toBe("doc");
    expect(fileKind("call.m4a")).toBe("media");
    expect(fileKind("bundle.zip")).toBe("other");
  });
  it("reads the file's type first, so a name without a known ending still lands in its group (AI Soul 06406d5)", () => {
    expect(fileKind("IMG_0412", "image/heic")).toBe("image");
    expect(fileKind("voice memo", "audio/mp4")).toBe("media");
    expect(fileKind("export", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe("sheet");
    expect(fileKind("notes", "text/plain")).toBe("doc");
    expect(fileKind("contract", "application/pdf")).toBe("doc");
    expect(fileKind("archive", "application/zip")).toBe("other");
    expect(fileKind("photo.png", null)).toBe("image");
    expect(fileKind("no-extension")).toBe("other");
  });
  it("today · this week · earlier (the browser's calendar day; tests run in UTC)", () => {
    const now = Date.parse("2026-10-03T12:00:00Z");
    expect(dayGroup("2026-10-03T00:10:00Z", now)).toBe("today");
    expect(dayGroup("2026-10-02T23:50:00Z", now)).toBe("week");
    expect(dayGroup("2026-09-20T12:00:00Z", now)).toBe("older");
    expect(dayGroup("not a date", now)).toBe("older");
  });
  it("sizes: never 0 KB, one decimal under 10 MB", () => {
    expect(humanSize(200)).toBe("1 KB");
    expect(humanSize(1_300_000)).toBe("1.2 MB");
    expect(humanSize(52_000_000)).toBe("50 MB");
    expect(humanSize(-5)).toBe("—");
  });
});
