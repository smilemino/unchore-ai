// A code box names its language in the top-left (ported from AI Soul Markdown.tsx code-lang, 2026-10-01 sync).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "@/components/Markdown";

describe("code box language label", () => {
  it("shows the language and leaves room above the first line", () => {
    const html = renderToStaticMarkup(createElement(Markdown, { text: "```python\nprint(1)\n```" }));
    expect(html).toMatch(/data-testid="code-lang"[^>]*>python</);
    expect(html).toContain("padding-top:1.9em");
  });
  it("no label when the block has no language", () => {
    const html = renderToStaticMarkup(createElement(Markdown, { text: "```\nplain\n```" }));
    expect(html).not.toContain("code-lang");
  });
});
