// Batch 20 (owner «yes» 2026-09-30 08:55): HTML preview box, plain-words check, nightly look-back signals.
import { describe, expect, it } from "vitest";
import { htmlDoc, isPreviewable, PREVIEW_CSP, previewVersions } from "@/lib/previews";
import { acceptRewrite, jargonScore, worthChecking } from "@/lib/plain-gate";
import { signalOf } from "@/lib/nightly-review";

describe("html preview", () => {
  it("only html blocks with tags; the page always starts with the sealing rules", () => {
    expect(isPreviewable("html", "<h1>Hi</h1>")).toBe(true);
    expect(isPreviewable("js", "<h1>Hi</h1>")).toBe(false);
    expect(isPreviewable("html", "just text")).toBe(false);
    expect(htmlDoc("<h1>Hi</h1>")).toContain(PREVIEW_CSP);
    expect(htmlDoc("<html><head><title>x</title></head><body>b</body></html>").indexOf(PREVIEW_CSP)).toBeLessThan(htmlDoc("<html><head><title>x</title></head><body>b</body></html>").indexOf("<title>"));
    expect(htmlDoc("<html><body>b</body></html>")).toContain(`<head>${PREVIEW_CSP}</head>`);
    expect(PREVIEW_CSP).toContain("connect-src 'none'");
  });
});

describe("plain-words check", () => {
  it("checks long or technical answers, not when they asked for code", () => {
    expect(worthChecking("short answer", "hi")).toBe(false);
    expect(worthChecking("x".repeat(700), "explain")).toBe(true);
    expect(worthChecking("Set `NODE_ENV` in the .env and call the API endpoint with the OAuth token via the CLI. ".repeat(3), "how?")).toBe(true);
    expect(worthChecking("x".repeat(700), "show me the exact code")).toBe(false);
    expect(jargonScore("plain words only")).toBe(0);
  });
  it("drops a rewrite that loses numbers, copy boxes or marks, or shrinks too much", () => {
    const orig = "Costs 1,200, 3,400, 5,600 and 7,800.\n```copy\nHello team\n```\n<<<pick>>>\n- a\n<<<end>>>\n" + "more words ".repeat(20);
    expect(acceptRewrite(orig, orig.replace("more words", "plainer words"))).toBe(true);
    expect(acceptRewrite(orig, orig.replace("3,400", "about three thousand").replace("5,600", "x"))).toBe(false);
    expect(acceptRewrite(orig, orig.replace("Hello team", "Hi team"))).toBe(false);
    expect(acceptRewrite(orig, orig.replace("<<<pick>>>", ""))).toBe(false);
    expect(acceptRewrite(orig, "short")).toBe(false);
  });
});

describe("nightly look-back", () => {
  it("next message says plainer / wrong, or the answer failed", () => {
    expect(signalOf(true, "쉽게 다시 설명해 주세요")).toBe("plain");
    expect(signalOf(true, "That's not what I meant")).toBe("fix");
    expect(signalOf(false, null)).toBe("error");
    expect(signalOf(true, "thanks! and tomorrow?")).toBeNull();
    expect(signalOf(true, null)).toBeNull();
  });
});

// The preview window flips through the chat's pages (AI Soul lib/previews.ts previewVersions · Preview.tsx ◀ n/N ▶).
describe("preview versions", () => {
  const a1 = "Here:\n```html\n<p>one</p>\n```", a2 = "Fixed:\n```html\n<p>two</p>\n```\nand a script:\n```js\nx()\n```", a3 = "Again:\n```html\n<p>two</p>\n```";
  it("lists every page in the chat, oldest first, and opens at the clicked one", () => {
    expect(previewVersions([a1, a2], "<p>one</p>")).toEqual({ list: ["<p>one</p>", "<p>two</p>"], start: 0 });
    expect(previewVersions([a1, a2], "<p>two</p>")).toEqual({ list: ["<p>one</p>", "<p>two</p>"], start: 1 });
  });
  it("the same page twice in a row counts once; a page not found stands alone", () => {
    expect(previewVersions([a1, a2, a3], "<p>two</p>").list).toHaveLength(2);
    expect(previewVersions([a1], "<b>other</b>")).toEqual({ list: ["<b>other</b>"], start: 0 });
  });
});
