import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// AI Soul 158a09a: on a computer's empty first screen the input box sits right under the greeting, both centred together —
// not the greeting in the middle and the box far below. Phones keep the box at the bottom (md: classes only).
describe("computer first screen", () => {
  const src = readFileSync(new URL("../components/Chat.tsx", import.meta.url), "utf8");
  it("centres the greeting and the input box as one group", () => {
    expect(src).toContain('className={`h-full flex flex-col${first ? " md:justify-center" : ""}`}');
    // the message area stops filling the screen (so the box rises under the greeting) but can still shrink and scroll
    expect(src).toMatch(/overflow-y-auto overflow-x-hidden px-3 md:px-6 py-4 \$\{first \? "md:flex-initial md:min-h-0" : ""\}/);
    expect(src).not.toContain("md:pb-[20vh]");
  });
  it("only on desktop widths — phone classes are unchanged", () => {
    expect(src).not.toMatch(/first \? "(?:[^"]*\s)?(?:justify-center|flex-initial)/);
  });
});
