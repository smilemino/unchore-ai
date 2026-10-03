import { describe, expect, it } from "vitest";
import { findNotes } from "@/lib/notes-find";

const rows = [
  { title: "Launch plan", body: "Ship on Monday, email the list first.", tags: ["plan"] },
  { title: "Pricing", body: "Keep $49 a month; yearly later.", tags: ["money"] },
];
describe("my notes search", () => {
  it("empty search shows every note", () => { expect(findNotes(rows, "  ")).toHaveLength(2); });
  it("every word must appear in title, tags or text", () => {
    expect(findNotes(rows, "monday EMAIL").map((n) => n.title)).toEqual(["Launch plan"]);
    expect(findNotes(rows, "money").map((n) => n.title)).toEqual(["Pricing"]);
    expect(findNotes(rows, "plan yearly")).toHaveLength(0);
  });
});
