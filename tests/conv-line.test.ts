import { trFor } from "@/lib/i18n-server";
const ko = { lang: "ko" as const, t: trFor("ko") }, en = { lang: "en" as const, t: trFor("en") };
import { describe, expect, it } from "vitest";
import { dotState, foldRows, groupRows, listGroups, previewLine, projectTag, timeText, type ListRow } from "../lib/conv-line";
import { readFileSync } from "node:fs";

const row = (id: string, o: Partial<ListRow> = {}): ListRow => ({ id, title: id, updated_at: "2026-09-29T14:00:00Z", pinned: false, project_id: null, done: false, last_role: "assistant", ...o });

describe("conversation list — AI Soul's look", () => {
  it("status circle: the user's message waiting = busy, marked done = done, else idle", () => {
    expect(dotState(row("a", { last_role: "user" }))).toBe("working");
    const now = Date.parse("2026-09-30T03:00:00Z");
    expect(dotState(row("a", { last_role: "user", last_at: "2026-09-30T02:55:00Z" }), now)).toBe("working");
    expect(dotState(row("a", { last_role: "user", last_at: "2026-09-30T02:40:00Z" }), now)).toBe("idle");   // the answer never came — not busy forever
    expect(dotState(row("a", { done: true }))).toBe("done");
    expect(dotState(row("a"))).toBe("idle");
  });
  it("groups in order pinned → in progress → chats → done, and done folds after 5", () => {
    const rows = [row("p", { pinned: true }), row("w", { last_role: "user" }), row("r"), ...Array.from({ length: 8 }, (_, i) => row(`d${i}`, { done: true }))];
    const g = groupRows(rows, trFor("ko"));
    expect(g.map((x) => x.key)).toEqual(["pin", "working", "rest", "done"]);
    expect(g[3]!.head).toBe("완료 8");
    const f = foldRows(g[3]!, false, "d7");
    expect(f.rows.map((r) => r.id)).toEqual(["d0", "d1", "d2", "d3", "d4", "d7"]);   // the chat you're in stays
    expect(f.hidden).toBe(2);
    expect(foldRows(g[3]!, true, null).hidden).toBe(0);
  });
  it("time: today HH:MM, yesterday, else M/D — in the user's zone", () => {
    const now = Date.parse("2026-09-29T14:30:00Z");   // 23:30 in Seoul
    expect(timeText("2026-09-29T14:00:00Z", ko, "Asia/Seoul", now)).toBe("23:00");
    expect(timeText("2026-09-28T10:00:00Z", ko, "Asia/Seoul", now)).toBe("어제");
    expect(timeText("2026-09-24T10:00:00Z", en, "Asia/Seoul", now)).toBe("9/24");
  });
  it("the line under a title prefers «결론:»; project tag is the first word", () => {
    expect(previewLine("## 제목\n본문 첫 줄\n결론: 끝났습니다.")).toBe("결론: 끝났습니다.");
    expect(previewLine("**첫 줄**\n둘째")).toBe("첫 줄");
    expect(projectTag("AI 소울 개선")).toBe("AI 소울");
    expect(projectTag("가게 운영")).toBe("가게");
  });
});

describe("phone first screen list (AI Soul components/HomeList.tsx)", () => {
  const rows = [row("p", { pinned: true }), row("w", { last_role: "user" }), row("r"), row("d", { done: true })];
  it("shows the same groups as the left list; a search is one «Found» group in the server's order", () => {
    expect(listGroups(rows, "", en.t).map((g) => g.key)).toEqual(groupRows(rows, en.t).map((g) => g.key));
    const found = listGroups(rows, "  hi ", en.t);
    expect(found).toHaveLength(1);
    expect(found[0]!.key).toBe("rest");
    expect(found[0]!.rows.map((r) => r.id)).toEqual(["p", "w", "r", "d"]);
  });
  it("sits on the empty first screen for phones only, outside projects, and reads the left list's rows instead of asking again", () => {
    const chat = readFileSync("components/Chat.tsx", "utf8"), home = readFileSync("components/HomeList.tsx", "utf8"), shell = readFileSync("components/Shell.tsx", "utf8");
    expect(chat).toContain('{projectId ? null : <div className="md:hidden"><HomeList /></div>}');
    expect(shell).toContain("new CustomEvent(LIST_EVENT");
    expect(home.match(/fetch\(/g)).toHaveLength(1);   // only the search asks the server
    expect(home).toContain("/api/conversations?q=");
  });
});
