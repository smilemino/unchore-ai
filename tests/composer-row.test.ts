import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// AI Soul 10/2 07:11 (owner's phone photo): with large phone text the composer row wrapped and Send (↑) dropped under ＋.
// The AI name must take only the room that is left (basis 0) and shorten, so ＋ · AI · 🎤 · 🎧 · ↑ stay on one line.
describe("composer tool row", () => {
  const src = readFileSync(new URL("../components/Chat.tsx", import.meta.url), "utf8");
  it("the AI name slot never pushes Send to the next line", () => {
    expect(src).toMatch(/className="flex-1 basis-0 min-w-0 flex justify-end" data-testid="ai-pick-slot"/);
    expect(src).toMatch(/<label className="relative min-w-0 max-w-full [^"]*" title=\{t\("AI"\)\}>\s*<span className="truncate">/);
  });
});
