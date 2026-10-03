import { describe, expect, it } from "vitest";
import { voicePip } from "../lib/voice/pip";

const state = { voice: true, hearing: false, busy: false, heard: "", note: "", messages: [{ role: "user", content: "Current question" }, { role: "assistant", content: "Current answer" }] };
describe("floating voice window shows the current turn", () => {
  it("shows fresh dictation instead of the previous answer, even while thinking", () => {
    expect(voicePip({ ...state, hearing: true, busy: true, heard: "  More\nwords " })).toEqual({ phase: "listening", line: "More words" });
    expect(voicePip({ ...state, hearing: true })).toEqual({ phase: "listening", line: "" });
  });
  it("keeps the current question visible while making an answer, not an unrelated draft", () => {
    expect(voicePip({ ...state, busy: true, heard: "Unsent draft" })).toEqual({ phase: "thinking", line: "Current question" });
  });
  it("shows the end of long replies without splitting emoji", () => {
    const answer = "x".repeat(90) + "😀".repeat(60);
    expect(voicePip({ ...state, messages: [{ role: "assistant", content: answer }] }).line).toBe("…" + "😀".repeat(60));
  });
  it("puts notices first but clears the window when voice mode closes", () => {
    expect(voicePip({ ...state, note: "n".repeat(70) }).line).toBe("n".repeat(60) + "…");
    expect(voicePip({ ...state, note: "Notice", voice: false })).toEqual({ phase: "off", line: "" });
  });
  it("does not revive replaced/failed replies or an old answer after a new question", () => {
    const messages = [...state.messages, { role: "assistant", content: "Replaced", superseded: true }, { role: "assistant", content: "Failed", failed: true }];
    expect(voicePip({ ...state, messages }).line).toBe("Current answer");
    expect(voicePip({ ...state, messages: [...messages, { role: "user", content: "New question" }] }).line).toBe("");
    expect(voicePip({ ...state, messages: [] }).line).toBe("");
  });
});
