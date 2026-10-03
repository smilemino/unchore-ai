// Batch 17 (owner «yes» 2026-09-30 08:55): «your turn» 🟠 and «done» marks (AI Soul lib/conv-mark.ts · lib/ask-judge.ts).
import { describe, expect, it } from "vitest";
import { answerAsks, mayAsk, readDoneMark } from "@/lib/turn-mark";
import { dotState, groupRows, turnRows, type ListRow } from "@/lib/conv-line";

const T = (s: string) => s;
const row = (o: Partial<ListRow> & { asks?: boolean | null }): ListRow & { asks?: boolean | null } => ({ id: "x", title: "t", updated_at: "2026-09-30T00:00:00Z", pinned: false, project_id: null, done: false, last_role: "assistant", last_at: "2026-09-30T00:00:00Z", ...o });

describe("done line", () => {
  it("taken out of the last three lines only", () => {
    expect(readDoneMark("Made the file.\n\n[done]")).toEqual({ text: "Made the file.", done: true });
    expect(readDoneMark("끝났습니다.\n[완료]\n")).toEqual({ text: "끝났습니다.", done: true });
    expect(readDoneMark("[done]\na\nb\nc").done).toBe(false);
    expect(readDoneMark("I'm [done] with it").done).toBe(false);
  });
});

describe("waiting for the member", () => {
  it("no hint → not waiting, without asking any AI", async () => {
    expect(mayAsk("The dollar is 1,392 won today.")).toBe(false);
    expect(await answerAsks("The dollar is 1,392 won today.", { judge: true, model: "claude-haiku-4-5", keys: { anthropic: "k" } })).toBe(false);
  });
  it("a clear question → waiting (rule, when the AI check is off)", async () => {
    expect(await answerAsks("I can set it up. What time should I send it?", { judge: false, model: null, keys: {} })).toBe(true);
    expect(await answerAsks("매일 8시에 보내 드릴까요?", { judge: true, model: null, keys: {} })).toBe(true);
  });
  it("list: 🟠 group after in progress, oldest first for the first screen", () => {
    const a = row({ id: "a", asks: true, last_at: "2026-09-30T02:00:00Z" }), b = row({ id: "b", asks: true, last_at: "2026-09-30T01:00:00Z" });
    const c = row({ id: "c", asks: true, done: true }), d = row({ id: "d", asks: false });
    expect(dotState(a)).toBe("turn");
    expect(dotState(c)).toBe("done");
    expect(dotState(row({ asks: true, last_role: "user", last_at: new Date().toISOString() }))).toBe("working");
    expect(groupRows([a, b, c, d], T).map((g) => g.key)).toEqual(["turn", "rest", "done"]);
    expect(turnRows([a, b, c, d]).map((r) => r.id)).toEqual(["b", "a"]);
  });
});
