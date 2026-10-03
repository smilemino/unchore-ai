import { describe, expect, it } from "vitest";
import { hitSnippet } from "@/lib/conv-line";

// «Found in a message» under a chat in search results (AI Soul ConvItem «찾은 글»): the words around the match.
describe("search hit line", () => {
  it("shows the match with words around it, cut with «…»", () => {
    const text = `${"intro words ".repeat(10)}the grapes count was 4729 this month ${"more words ".repeat(10)}`;
    const s = hitSnippet(text, "GRAPES")!;
    expect(s).toContain("the grapes count was 4729");
    expect(s.startsWith("…")).toBe(true);
    expect(s.endsWith("…")).toBe(true);
    expect(s.length).toBeLessThan(110);
  });
  it("keeps a short text whole and folds line breaks", () => {
    expect(hitSnippet("재고는\n청포도 4,729개", "청포도")).toBe("재고는 청포도 4,729개");
  });
  it("returns null when the words aren't there", () => {
    expect(hitSnippet("nothing here", "grapes")).toBeNull();
    expect(hitSnippet("nothing here", "")).toBeNull();
  });
});
