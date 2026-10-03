import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildPrompt, userLine } from "../worker/claude.mjs";
import { codexArgs } from "../worker/chatgpt.mjs";

// 2026-10-01: an image attached to a chat answered by the member's Claude/ChatGPT plan never reached the AI —
// lib/ai.ts kept only role+content for the plan, so the answer said «I can't see the image».
describe("pictures reach the member's own plan", () => {
  const png = { mime: "image/png", b64: "iVBORw0KGgo=" };
  it("keeps the images on the last turn only, and only the kinds the AI reads", () => {
    const p = buildPrompt("SYS", [
      { role: "user", content: "old", images: [png] },
      { role: "assistant", content: "ok" },
      { role: "user", content: "what is this?", images: [png, { mime: "application/pdf", b64: "JVBE" }, { mime: "image/jpeg", b64: "" }] },
    ]);
    expect(p.text).toBe("what is this?");
    expect(p.images).toEqual([png]);
    expect(buildPrompt("SYS", [{ role: "user", content: "x" }]).images).toEqual([]);
  });
  it("Claude Code gets the picture as an image block before the words", () => {
    const j = JSON.parse(userLine("what is this?", [png]));
    expect(j.message.content[0]).toEqual({ type: "image", source: { type: "base64", media_type: "image/png", data: png.b64 } });
    expect(j.message.content[1]).toEqual({ type: "text", text: "what is this?" });
    expect(JSON.parse(userLine("hi")).message.content).toEqual([{ type: "text", text: "hi" }]);
  });
  it("Codex gets each picture with -i, the question still from standard input", () => {
    const a = codexArgs("gpt-6-sol", "/tmp/w", ["/tmp/img0.png", "/tmp/img1.jpeg"]);
    expect(a.slice(-5)).toEqual(["-i", "/tmp/img0.png", "-i", "/tmp/img1.jpeg", "-"]);
    expect(codexArgs("gpt-6-sol", "/tmp/w").at(-1)).toBe("-");
  });
  it("the app no longer strips images before calling the plan, and the worker takes bodies big enough for them", () => {
    const ai = readFileSync("lib/ai.ts", "utf8");
    expect(ai).not.toMatch(/messages\.map\(\(\{ role, content \}\) => \(\{ role, content \}\)\)/);
    const cap = Number(/body\.length > ([\d_]+)/.exec(readFileSync("worker/main.mjs", "utf8"))![1]!.replace(/_/g, ""));
    expect(cap).toBeGreaterThan(Math.ceil((4 * 1024 * 1024 * 4) / 3) * 3);   // three 4 MB pictures in base64
  });
});
