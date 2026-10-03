import { describe, expect, it } from "vitest";
import { askedStop, askedTimed, atInstant, checkSpec, extractReminders, toSchedule } from "@/lib/reminders";
import { blocked, decideOps, pickMemories } from "@/lib/memory";
import { makeFiles } from "@/lib/files";
import { parseTitle } from "@/lib/title";
import { nextRun, validSchedule } from "@/lib/schedule";
import { joinHeard } from "@/components/speech";

describe("reminders", () => {
  it("pulls a block out and keeps the rest", () => {
    const r = extractReminders("Sure.\n<<<remind every=5m for=3h>>>\ncheck BTC\n<<<end>>>");
    expect(r.content).toBe("Sure.");
    expect(r.proposals).toEqual([{ kind: "every", spec: "5m", forSpec: "3h", prompt: "check BTC" }]);
  });
  it("accepts the Korean soul form and the stop mark", () => {
    const r = extractReminders("끝났어요 <<<예약끝>>>");
    expect(r.stop).toBe(true);
    expect(extractReminders("<<<예약 daily=09:00>>>뉴스<<<끝>>>").proposals[0]!.kind).toBe("daily");
  });
  it("only counts reminders the user asked for with a time", () => {
    expect(askedTimed("5분마다 비트코인 알려줘")).toBe(true);
    expect(askedTimed("remind me every morning")).toBe(true);
    expect(askedTimed("비트코인 얼마야")).toBe(false);
    expect(askedStop("예약 그만")).toBe(true);
    expect(askedStop("stop the reminders")).toBe(true);
  });
  it("checks specs and builds schedules", () => {
    expect(checkSpec({ kind: "every", spec: "30s" as never, forSpec: null, prompt: "x" })).not.toBeNull();
    const now = new Date("2026-09-29T09:00:00Z");
    const s = toSchedule({ kind: "every", spec: "5m", forSpec: null, prompt: "x" }, "Asia/Seoul", now);
    expect(s.schedule).toBe("every:5m");
    expect(validSchedule(s.schedule)).toBe(true);
    expect(nextRun("every:5m", "UTC", now).getTime() - now.getTime()).toBe(300_000);
    const once = toSchedule({ kind: "after", spec: "30m", forSpec: null, prompt: "x" }, "UTC", now);
    expect(validSchedule(once.schedule)).toBe(true);
    expect(nextRun(once.schedule, "UTC", now).toISOString()).toBe("2026-09-29T09:30:00.000Z");
  });
  it("resolves «at» in the user's zone", () => {
    const now = new Date("2026-09-29T09:00:00Z"); // 18:00 in Seoul
    expect(atInstant("20:00", "Asia/Seoul", now).toISOString()).toBe("2026-09-29T11:00:00.000Z");
    expect(atInstant("10:00", "Asia/Seoul", now).toISOString()).toBe("2026-09-30T01:00:00.000Z");
    expect(atInstant("2026-10-01T10:00", "Asia/Seoul", now).toISOString()).toBe("2026-10-01T01:00:00.000Z");
  });
});

describe("memory", () => {
  it("blocks sensitive things", () => {
    expect(blocked("My card is 1234-5678-9012-3456")).toContain("card");
    expect(blocked("Prefers short answers with bullet points")).toEqual([]);
  });
  it("only deletes when the user asked", () => {
    const ex = [{ id: "a", text: "Likes tea", created_at: "" }];
    expect(decideOps([{ op: "delete", id: "a" }], "hello", ex)).toEqual([]);
    expect(decideOps([{ op: "delete", id: "a" }], "forget that", ex)).toEqual([{ op: "delete", id: "a" }]);
    expect(decideOps([{ op: "add", text: "Likes tea" }], "x", ex)).toEqual([]);
  });
  it("changes a memory the member added by hand only when they said fix or forget", () => {
    const ex = [{ id: "h", text: "Lives in Lisbon", created_at: "", hand: true }, { id: "a", text: "Likes tea", created_at: "" }];
    const up = (id: string) => [{ op: "update", id, text: "Lives in Porto now" }];
    expect(decideOps(up("h"), "what should I cook tonight", ex)).toEqual([]);
    expect(decideOps(up("a"), "what should I cook tonight", ex)).toEqual([{ op: "update", id: "a", text: "Lives in Porto now" }]);
    expect(decideOps(up("h"), "that's wrong, I moved to Porto", ex)).toHaveLength(1);
    expect(decideOps(up("h"), "리스본 아니고 포르투야, 고쳐줘", ex)).toHaveLength(1);
    expect(decideOps(up("h"), "forget Lisbon, I live in Porto", ex)).toHaveLength(1);
    expect(decideOps([{ op: "delete", id: "h" }], "that's wrong", ex)).toEqual([]);
  });
  it("picks related memories first", () => {
    const ms = [{ id: "1", text: "Works at a bakery", created_at: "" }, { id: "2", text: "Flies to Osaka often", created_at: "" }];
    expect(pickMemories("cheap flight to Osaka", ms, 1)[0]!.id).toBe("2");
  });
});

describe("files", () => {
  it("builds an xlsx from a block and hides the JSON", () => {
    const r = makeFiles('Here.\n```unchore-file\n{"format":"xlsx","name":"Sales","sheets":[{"rows":[["a",1]]}]}\n```');
    expect(r.files).toHaveLength(1);
    expect(r.files[0]!.name).toBe("Sales.xlsx");
    expect(r.files[0]!.data.subarray(0, 2).toString()).toBe("PK");
    expect(r.text).toContain("📎 Sales");
  });
  it("builds a Korean PDF", () => {
    const r = makeFiles('```unchore-file\n{"format":"pdf","name":"안내.pdf","paragraphs":[{"text":"추석 휴무 안내","style":"title"}]}\n```');
    expect(r.failed).toEqual([]);
    expect(r.files[0]!.data.subarray(0, 4).toString()).toBe("%PDF");
  });
});

describe("small helpers", () => {
  it("title", () => { expect(parseTitle('"Busan weather tomorrow."')).toBe("Busan weather tomorrow"); expect(parseTitle("")).toBeNull(); });
  it("joinHeard does not double repeated pieces", () => { expect(joinHeard("지금도", "지금도 괜찮은데")).toBe("지금도 괜찮은데"); expect(joinHeard("a b", "b")).toBe("a b"); });
});

import { parseExport } from "@/lib/importer";
import { autoModel, needsStrong } from "@/lib/ai";
import { parseSubscription } from "@/lib/push";
describe("parity 2", () => {
  it("imports Claude and ChatGPT exports", () => {
    const claude = parseExport([{ name: "Trip", created_at: "2026-01-01T00:00:00Z", chat_messages: [{ sender: "human", text: "hi" }, { sender: "assistant", text: "hello" }] }]);
    expect(claude[0]!.messages).toHaveLength(2);
    const gpt = parseExport([{ title: "Code", create_time: 1, current_node: "b", mapping: { a: { message: { author: { role: "user" }, content: { parts: ["q"] } }, parent: null }, b: { message: { author: { role: "assistant" }, content: { parts: ["a"] } }, parent: "a" } } }]);
    expect(gpt[0]!.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
  });
  it("auto-pick uses the strong model for heavy questions", () => {
    expect(needsStrong("이 계약서 검토해 줘")).toBe(true);
    expect(needsStrong("안녕")).toBe(false);
    // Short but costly-if-wrong (health · money · security · steering) — the 2026-10-03 blind test's weak spots.
    for (const q of ["엄마 한쪽 얼굴이 갑자기 처졌어", "통장에서 모르는 돈이 매일 조금씩 빠져나가", "약 두 배로 먹었어", "Took too many pills.", "There are small charges I don't recognize on my card every few days.", "Easy task, use the cheap model: audit our login handler"]) expect(needsStrong(q)).toBe(true);
    for (const q of ["일본의 수도가 어디야?", "37 곱하기 12는?", "What's the capital of Australia?", "Tell me a quick joke about cats."]) expect(needsStrong(q)).toBe(false);
    expect(autoModel({ openai: "k" }, "hi")).toBe("gpt-6-luna");
    expect(autoModel({ anthropic: "k" }, "analyze this plan")).toBe("claude-opus-5-5");
  });
  it("only accepts real push services", () => {
    expect(parseSubscription({ endpoint: "https://evil.example/x", keys: { p256dh: "a", auth: "b" } })).toBeNull();
    expect(parseSubscription({ endpoint: "https://fcm.googleapis.com/fcm/send/x", keys: { p256dh: "abc", auth: "def" } })).not.toBeNull();
  });
});
