#!/usr/bin/env node
// Stands in for Claude Code in tests/claude-connectors.test.ts: reports what this turn can see (config folder, sign-in, leftovers),
// then leaves a «connector cache» and a log behind in its folders — as the real one does — for the next turn to (not) find.
import { readFileSync, writeFileSync, readdirSync, existsSync, rmSync, appendFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";

const argv = process.argv.slice(2);
if (process.env.FAKE_ARGS_LOG) appendFileSync(process.env.FAKE_ARGS_LOG, JSON.stringify(argv) + "\n");
const f = argv.indexOf("--system-prompt-file");
const system = f >= 0 ? readFileSync(argv[f + 1], "utf8") : "";
const cfg = process.env.CLAUDE_CONFIG_DIR;
const cred = path.join(cfg, ".credentials.json");
createInterface({ input: process.stdin }).on("line", (line) => {
  const q = JSON.parse(line).message.content.find((c) => c.type === "text").text;
  const me = existsSync(cred) ? readFileSync(cred, "utf8") : "none";
  const seen = { cfg, home: process.env.HOME, cache: process.env.XDG_CACHE_HOME, me, files: readdirSync(cfg).sort(), homeFiles: readdirSync(process.env.HOME), system,
    account: JSON.parse(readFileSync(path.join(cfg, ".claude.json"), "utf8")) };
  writeFileSync(path.join(cfg, "mcp-connectors-cache.json"), JSON.stringify({ connectors: [`Notion of ${me}`], lastQuestion: q }));
  writeFileSync(path.join(process.env.HOME, "history.log"), q);
  writeFileSync(path.join(process.env.XDG_CACHE_HOME, "mcp-log.txt"), q);
  if (process.env.FAKE_RENEW) { rmSync(cred); writeFileSync(cred, `${me}-renewed`); }   // a renewed sign-in replaces the link with a file
  process.stdout.write(JSON.stringify({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: JSON.stringify(seen) } } }) + "\n");
  process.stdout.write(JSON.stringify({ type: "result", is_error: false, result: "" }) + "\n");
});
