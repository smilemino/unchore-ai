import { describe, expect, it } from "vitest";
import { holdLine } from "../lib/hold-line";
import { dotState, groupRows, turnRows, type ListRow } from "../lib/conv-line";

const row = (id: string, o: Partial<ListRow> = {}): ListRow => ({ id, title: id, updated_at: "2026-10-02T10:00:00Z", pinned: false, project_id: null, done: false, last_role: "assistant", ...o });

// Ported from AI Soul tests/conv-mark.test.ts (5f832fc · db2c480 · 8404961)
describe("⏳ In progress — waiting on something outside", () => {
  it("reads the ⏳ line at the end of an answer", () => {
    expect(holdLine("Sent it.\n\n⏳ In progress — the landlord's reply by email")).toBe("the landlord's reply by email");
    expect(holdLine("Enviado.\n⏳ **En curso:** respuesta de la tienda")).toBe("respuesta de la tienda");
    expect(holdLine("⏳ In progress — their reply\n\nDetails: looked it up")).toBe("their reply");
    expect(holdLine("A job is in progress right now.")).toBeNull();
    expect(holdLine("⏳ In progress — their reply\n1\n2\n3")).toBeNull();   // not at the end any more
    expect(holdLine("⏳")).toBeNull();
    expect(holdLine(null)).toBeNull();
  });
  it("a Details block after the ⏳ line still counts", () => {
    expect(holdLine("Report\n\n⏳ In progress — the shop's review\n\n---\nDetails\n- a\n- b\n- c\n- d")).toBe("the shop's review");
    expect(holdLine("⏳ In progress — the shop's review\n**Details**\n- a\n- b\n- c")).toBe("the shop's review");
    expect(holdLine("⏳ In progress — old line\nmore text\n---\nDetails\n- a\n- b")).toBeNull();
  });
  it("two ⏳ + Details pairs — the newest wins (an old quoted line is never picked)", () => {
    expect(holdLine("⏳ In progress — old quote\n---\nDetails\n- a\n\nNew report\n⏳ In progress — waiting now\n---\nDetails\n- b\n- c\n- d")).toBe("waiting now");
  });
  it("the chat list shows it under «In progress», not «Your turn»", () => {
    const r = row("a", { asks: true, hold: "the landlord's reply" });
    expect(dotState(r)).toBe("working");
    expect(turnRows([r])).toEqual([]);
    expect(groupRows([r], (s) => s)[0]!.key).toBe("working");
    expect(dotState(row("a", { asks: true, hold: "x", done: true }))).toBe("done");   // marked done wins
    expect(dotState(row("a", { asks: true }))).toBe("turn");
  });
});
