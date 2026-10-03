import { describe, expect, it } from "vitest";
import { CLOUD_PC_GUIDE } from "../lib/tools/computer";

// Night 2026-10-03: first-day chats started the member's cloud computer six times to read prices and pages for a watch,
// and one answer told the member about a «baseline file» at a server path that no scheduled check reads.
describe("cloud computer guide", () => {
  it("keeps price, page and news reads for watches on the app's readers", () => {
    expect(CLOUD_PC_GUIDE).toContain("Don't start the browser or the computer to read a price, a rate or the news, or to set up a watch or reminder");
  });
  it("never shows the member paths on the computer", () => {
    expect(CLOUD_PC_GUIDE).toContain("Never tell the member about paths or files on the computer");
  });
});
