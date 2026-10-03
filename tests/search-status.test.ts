import { describe, expect, it } from "vitest";
import { searchLine } from "@/lib/search-status";

describe("«Searching the web…» line (lib/search-status.ts)", () => {
  const make = () => {
    const out: string[] = [];
    return { out, s: searchLine((x) => out.push(x), (k) => (k === "search" ? "S" : "R")) };
  };
  it("shows a line for the web tools of Claude Code and of the Anthropic API", () => {
    const { out, s } = make();
    expect(s.tool("WebSearch")).toBe(true);
    expect(s.tool("web_search")).toBe(true);
    expect(s.tool("WebFetch")).toBe(true);
    expect(s.tool("web_fetch")).toBe(true);
    expect(out).toEqual(["\u0001S\u0001", "\u0001S\u0001", "\u0001R\u0001", "\u0001R\u0001"]);
  });
  it("leaves other tools to the caller", () => {
    const { out, s } = make();
    expect(s.tool("browser")).toBe(false);
    expect(s.tool("Bash")).toBe(false);
    expect(out).toEqual([]);
  });
  it("takes the line away once when the answer words come, and not otherwise", () => {
    const { out, s } = make();
    s.text();
    expect(out).toEqual([]);
    s.tool("WebSearch");
    s.text(); s.text();
    expect(out).toEqual(["\u0001S\u0001", "\u0001\u0001"]);
  });
});
