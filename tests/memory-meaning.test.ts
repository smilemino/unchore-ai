import { describe, expect, it, vi } from "vitest";

// The member's own fast AI (their key) picks by meaning; here it is a fake that records what it was asked.
const fake = vi.hoisted(() => ({ reply: "", calls: [] as Array<{ model: string; key: string; content: string }>, fail: false }));
vi.mock("@/lib/ai", async (orig) => {
  const real = await orig<typeof import("@/lib/ai")>();
  return { ...real, complete: async (o: { model: string; key: string; messages: Array<{ content: string }> }) => {
    fake.calls.push({ model: o.model, key: o.key, content: o.messages[0]!.content });
    if (fake.fail) throw new Error("down");
    return fake.reply;
  } };
});
import { parsePicks, pickByMeaning, pickMemories, type Memory } from "@/lib/memory";

const many: Memory[] = Array.from({ length: 40 }, (_, i) => ({ id: `m${i}`, text: `Note number ${i} about gardening tomatoes`, created_at: "" }));
many[35] = { id: "plan", text: "Pays for the Pro subscription every month", created_at: "" };

describe("picking memories by meaning", () => {
  it("a picked memory goes in even when it shares no words and recency would leave it out", () => {
    const q = "what happens if I cancel?";
    expect(pickMemories(q, many, 5).map((m) => m.id)).not.toContain("plan");
    expect(pickMemories(q, many, 5, 4000, ["plan"])[0]!.id).toBe("plan");
  });
  it("reads only list numbers that exist, at most 3", () => {
    const l = many.slice(0, 5);
    expect(parsePicks('```json\n{"pick":[2,9,2,1.5,"3"]}\n```', l)).toEqual(["m1"]);
    expect(parsePicks('{"pick":[1,2,3,4]}', l)).toEqual(["m0", "m1", "m2"]);
    expect(parsePicks("no idea", l)).toEqual([]);
  });
  it("asks the member's own AI with their key and maps the numbers back", async () => {
    fake.calls = []; fake.reply = '{"pick":[36]}';
    expect(await pickByMeaning("what happens if I cancel?", many, { openai: "member-key" }, 5)).toEqual(["plan"]);
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]!.key).toBe("member-key");
    expect(fake.calls[0]!.content).toContain("36. Pays for the Pro subscription");
  });
  it("no call without a connected AI or when every memory fits anyway; a failure picks nothing", async () => {
    fake.calls = [];
    expect(await pickByMeaning("cancel?", many, {}, 5)).toEqual([]);
    expect(await pickByMeaning("cancel?", many.slice(0, 6), { openai: "k" })).toEqual([]);
    expect(fake.calls).toHaveLength(0);
    fake.fail = true;
    expect(await pickByMeaning("cancel?", many, { openai: "k" }, 5)).toEqual([]);
    fake.fail = false;
  });
});
