// Nothing from the owner's private company tool or a real secret may enter this repo (2026-09-30 sync check:
// ported code carried company words and the owner's name in comments). Runs in CI and before every push.
// The word list is base64 so this file does not trip its own check.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const WORDS = Buffer.from(
  "66as66eB66qwCuumrO2NvOuftOunge2BrArsmKTripjtlL0K7IKs67Cp64S3CuyZgOyasOuEtwrsp4Dsl5TtjIztirjrhIjsiqQK6rmA66+87Zi4CuuMgO2RnOuLmArthZTroIjqt7jrnqgK67SH7YyACu2BrOuqvQpybGluawpvbmVscGljawpzbWlsZW1pbm83NwpkZXRhY2gtam9iCmttb25nCi93b3Jrc3BhY2Uv",
  "base64",
).toString("utf8").split("\n");
const SECRETS: RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]{30,}/, /\bsk-(?:proj-|or-v1-)?[A-Za-z0-9_-]{40,}/, /\bghp_[A-Za-z0-9]{30,}/, /\bAKIA[0-9A-Z]{16}\b/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /postgres(?:ql)?:\/\/[^\s'"`:@]+:[^\s'"`@$]{6,}@/, /\bre_[A-Za-z0-9]{24,}\b/, /\bAIza[0-9A-Za-z_-]{35}\b/,
];
// Allowed on purpose: the guard test that lists forbidden words for the AI's instructions.
const ALLOW: Array<[string, string]> = [["tests/core.test.ts", 'for (const w of ["']];
const BINARY = /\.(png|jpe?g|gif|ico|webp|ttf|otf|woff2?|wav|mp3|mp4|zip|pdf)$/i;

function tracked(): string[] {
  try { return execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter((f) => f && !BINARY.test(f) && f !== "tests/no-leak.test.ts"); } catch { return []; }
}

describe("no company words or secrets in the repo", () => {
  const files = tracked();
  it("can list the files", () => expect(files.length).toBeGreaterThan(20));
  it("has none", { timeout: 60_000 }, () => {
    const hits: string[] = [];
    for (const f of files) {
      let text = "";
      try { text = readFileSync(f, "utf8"); } catch { continue; }
      text.split("\n").forEach((line, i) => {
        if (ALLOW.some(([p, s]) => f === p && line.includes(s))) return;
        for (const w of WORDS) {
          const re = /^[\x00-\x7f]+$/.test(w) ? new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}`, "i") : null;
          if (re ? re.test(line) : line.includes(w)) hits.push(`${f}:${i + 1} word`);
        }
        for (const s of SECRETS) if (s.test(line)) hits.push(`${f}:${i + 1} secret`);
      });
    }
    expect(hits).toEqual([]);
  });
});
