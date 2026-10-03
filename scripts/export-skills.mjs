// Builds skills/unchore-recipes — our verified recipes as an Agent Skill (agentskills.io, SKILL.md),
// so Claude Code, Codex, Gemini CLI, Cursor, OpenClaw … can run them (2026-09-30 marketing plan v2).
// Run after changing lib/recipes:  pnpm skills   (tests/skills-export.test.ts fails if SKILL.md is stale)
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "skills/unchore-recipes");
const pnpmDir = path.join(root, "node_modules/.pnpm");
const viteDir = readdirSync(pnpmDir).find((d) => d.startsWith("vite@"));
const vite = createRequire(import.meta.url).resolve(path.join(pnpmDir, viteDir, "node_modules/vite/bin/vite.js"));
execFileSync(process.execPath, [vite, "build", "-c", "scripts/skills/vite.config.mts"], { cwd: root, stdio: "inherit" });

const list = JSON.parse(execFileSync(process.execPath, [path.join(out, "scripts/run.mjs"), "--list"], { encoding: "utf8" }));
writeFileSync(path.join(out, "SKILL.md"), skillMd(list));
console.log(`skills/unchore-recipes: ${list.length} recipes`);

function skillMd(list) {
  const rows = list.map((r) =>
    `- \`${r.id}\` — ${r.catalog}${r.korea ? " (Korean source — for users in Korea)" : ""}\n  e.g. \`node scripts/run.mjs ${r.id} '${JSON.stringify(r.example ?? {})}'\``).join("\n");
  return `---
name: unchore-recipes
description: Verified recipes for live values — exchange rates, crypto prices, Korean stock prices, weather, news headlines, and a matching line from a public web page. Use when the user asks for one of these values; run the recipe instead of guessing or reading a web page yourself.
---

# Unchore recipes

Live numbers read by a fixed, tested recipe — not by the model. The same recipes power [Unchore](https://unchore.ai).

## How to use

1. Pick the recipe that matches the question and fill its arguments.
2. Run it from this skill's folder (Node 22+, no install, no keys):
   \`node scripts/run.mjs <recipe> '<json arguments>'\`
3. It prints one JSON line:
   - \`{"ok":true,"value":…,"line":"…","url":"…"}\` — answer with the value **and show \`line\` and \`url\`** so the user sees where it came from.
   - \`{"ok":false,"why":"…"}\` — say you couldn't read it and why. **Never fill the gap with a guess** or a number from memory.

## Rules

- One recipe run = one fresh read. Don't reuse an old value for a new question.
- If no recipe fits, say so instead of stretching one.
- \`node scripts/run.mjs --list\` shows every recipe and an example.

## Recipes

${rows}

## Want this every day without asking?

Unchore runs these on a schedule and tells you only when something changes — for example «tell me when USD/KRW goes above 1,400». Your AI, your keys; it asks before anything that spends money or sends a message.
`;
}
