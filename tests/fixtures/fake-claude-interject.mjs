#!/usr/bin/env node
// Stands in for Claude Code in tests/interject.test.ts: answers in a step, and words that came in during the step are read
// after it and answered in the same answer (as the real one does with its input kept open).
import { createInterface } from "node:readline";

const out = (o) => process.stdout.write(JSON.stringify(o) + "\n");
const say = (text) => out({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text } } });
const waiting = [];
let working = false;
const work = () => {
  if (working || !waiting.length) return;
  working = true;
  say(`heard:${waiting.shift()}`);
  setTimeout(() => {
    while (waiting.length) say(` +${waiting.shift()}`);
    out({ type: "result", is_error: false, result: "" });
    working = false;
    work();
  }, Number(process.env.FAKE_STEP_MS ?? 400));
};
createInterface({ input: process.stdin }).on("line", (line) => {
  const content = JSON.parse(line).message.content;
  const pics = content.filter((c) => c.type === "image").length;
  waiting.push(content.find((c) => c.type === "text").text + (pics ? `[${pics} picture]` : ""));
  work();
});
