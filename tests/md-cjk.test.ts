// Bold glued to a Korean particle («**완료**로») must render bold (ported from AI Soul, 2026-09-30 sync).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "@/components/Markdown";

describe("markdown bold next to Korean text", () => {
  it("renders bold ending in a bracket with a particle right after", () => {
    const html = renderToStaticMarkup(createElement(Markdown, { text: "**초록색 체크(✓ 완료)**로 표시했습니다" }));
    expect(html).toContain("<strong>초록색 체크(✓ 완료)</strong>로");
    expect(html).not.toContain("**");
  });
  it("a decision card shows its words with bold and lists, not raw ** (AI Soul DecisionBox)", () => {
    const html = renderToStaticMarkup(createElement(Markdown, { text: "```decide\n**Pick one**\n- yes\n- no\n```" }));
    expect(html).toContain("<strong>Pick one</strong>");
    expect(html).toContain("<li>yes</li>");
    expect(html).not.toContain("**");
  });
});
