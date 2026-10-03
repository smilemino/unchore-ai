import { describe, expect, it } from "vitest";
import { mentionsProject, namedProjects, projectCommand, projectMoveNote } from "@/lib/project-move";

const P = [
  { id: "11111111-1111-1111-1111-111111111111", name: "Garden" },
  { id: "22222222-2222-2222-2222-222222222222", name: "Home Renovation" },
  { id: "33333333-3333-3333-3333-333333333333", name: "소울 개선" },
  { id: "44444444-4444-4444-4444-444444444444", name: "Home" },
];
const [GARDEN, RENO, SOUL, HOME] = P.map((p) => p.id) as [string, string, string, string];

describe("moving a chat by saying so", () => {
  it("«move this to the … project» in English and Korean moves to the one project named", () => {
    expect(projectCommand("move this to the Garden project", P, null)).toEqual({ kind: "move", id: GARDEN, name: "Garden" });
    expect(projectCommand("Please put this chat in my home renovation project.", P, GARDEN)).toEqual({ kind: "move", id: RENO, name: "Home Renovation" });
    expect(projectCommand("이거 소울개선 프로젝트로 옮겨 줘", P, null)).toEqual({ kind: "move", id: SOUL, name: "소울 개선" });
    expect(projectCommand("가든 아니고 소울 개선 프로젝트로 보내 주세요", P, GARDEN)).toEqual({ kind: "move", id: SOUL, name: "소울 개선" });
    expect(projectCommand("Garden project is wrong, move it to the Home Renovation project", P, GARDEN)).toEqual({ kind: "move", id: RENO, name: "Home Renovation" });
  });
  it("«not the right project» takes it out — only when the chat is in one and no other project is named", () => {
    expect(projectCommand("that's not the right project", P, GARDEN)).toEqual({ kind: "out" });
    expect(projectCommand("이 프로젝트 아니야", P, GARDEN)).toEqual({ kind: "out" });
    expect(projectCommand("that's not the right project", P, null)).toBeNull();
  });
  it("ordinary questions that mention a project stay questions", () => {
    expect(projectCommand("what's left to do in the Garden project?", P, null)).toBeNull();
    expect(projectCommand("put the Garden project deadline in my calendar", P, null)).toBeNull();
    expect(projectCommand("the Garden project answer was wrong, try again", P, GARDEN)).toBeNull();
    expect(projectCommand("move this to Garden", P, null)).toBeNull();   // no «project» word
    expect(projectCommand("move this to the Home or Garden project", P, null)).toBeNull();   // two named — don't guess
    expect(projectCommand(`move this to the Garden project ${"and more ".repeat(30)}`, P, null)).toBeNull();   // long message
    expect(projectCommand("move this to the Garden project", P, GARDEN)).toBeNull();   // already there
    expect(mentionsProject("hello there")).toBe(false);
  });
  it("a name inside a longer named one counts once", () => {
    expect(namedProjects("the home renovation project", P).map((p) => p.id)).toEqual([RENO]);
    expect(namedProjects("the home project", P).map((p) => p.id)).toEqual([HOME]);
  });
  it("the note tells the AI it's already done", () => {
    expect(projectMoveNote({ kind: "move", id: GARDEN, name: "Garden" })).toContain("«Garden»");
    expect(projectMoveNote({ kind: "out" })).toContain("taken out");
  });
});
