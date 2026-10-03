// A wide table scrolls inside its own box (AI Soul Markdown table-scroll, 2026-10-01 sync).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "@/components/Markdown";

describe("table scroll box", () => {
  it("wraps a table in a sideways-scrolling box", () => {
    const html = renderToStaticMarkup(createElement(Markdown, { text: "| a | b |\n|---|---|\n| 1 | 2 |" }));
    expect(html).toMatch(/<div class="overflow-x-auto my-2" data-testid="table-scroll"><table>/);
    expect(html).toContain("<td>1</td>");
  });
});
