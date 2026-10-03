import { describe, expect, it } from "vitest";
import { docPreview } from "@/lib/previews";

// AI Soul lib/previews.ts findPreviews: a table or a long text with headings opens as a document (with a .md download).
describe("document preview", () => {
  it("opens a markdown table as «Table»", () => {
    expect(docPreview("Here you go:\n\n| item | qty |\n|---|---:|\n| grapes | 4729 |\n")).toBe("Table");
  });
  it("opens a long text with headings as «Document»", () => {
    expect(docPreview(`# Plan\n\n${"A line about the plan. ".repeat(80)}\n## Next\nmore`)).toBe("Document");
  });
  it("leaves short answers, long answers without headings, and pipes that aren't a table alone", () => {
    expect(docPreview("# Short\nhello")).toBeNull();
    expect(docPreview("word ".repeat(400))).toBeNull();
    expect(docPreview("use a | b | c for the shell")).toBeNull();
  });
});
