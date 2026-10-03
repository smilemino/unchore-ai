#!/usr/bin/env node
// Stands in for Claude Code in tests/warm.test.ts: answers the set-up message and echoes the system prompt and the question.
import { readFileSync, appendFileSync } from "node:fs";
import { createInterface } from "node:readline";

const argv = process.argv.slice(2);
if (process.env.FAKE_ARGS_LOG) appendFileSync(process.env.FAKE_ARGS_LOG, JSON.stringify(argv) + "\n");
const f = argv.indexOf("--system-prompt-file");
let system = f >= 0 ? readFileSync(argv[f + 1], "utf8") : "";
const out = (o) => process.stdout.write(JSON.stringify(o) + "\n");
createInterface({ input: process.stdin }).on("line", (line) => {
  const j = JSON.parse(line);
  if (j.type === "control_request") {
    if (process.env.FAKE_REFUSE_INIT) return out({ type: "control_response", response: { subtype: "error", request_id: j.request_id, error: "no" } });
    system = j.request.systemPrompt; return out({ type: "control_response", response: { subtype: "success", request_id: j.request_id } });
  }
  const q = j.message.content.find((c) => c.type === "text").text;
  out({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: `SYS=${system} Q=${q}` } } });
  out({ type: "result", is_error: false, result: "" });
});
