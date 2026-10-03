import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { signedInEmail } from "../worker/chatgpt.mjs";
import { planLabel } from "@/lib/claude-sub";

// 2026-10-02: the AI connections row now shows which account a ChatGPT plan is signed in with (Claude already did),
// as AI Soul does (lib/account-email.ts there) — a member with a work and a home account can tell which one answers.
const dirs: string[] = [];
function folder(auth: unknown): string {
  const d = mkdtempSync(path.join(os.tmpdir(), "codex-email-"));
  dirs.push(d);
  if (auth !== undefined) writeFileSync(path.join(d, "auth.json"), typeof auth === "string" ? auth : JSON.stringify(auth));
  return d;
}
const jwt = (payload: unknown) => `x.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.sig`;
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe("plan account e-mail", () => {
  it("reads only the e-mail from Codex's sign-in", () => {
    expect(signedInEmail(folder({ tokens: { id_token: jwt({ email: "sam.lee@example.com", sub: "u1" }), access_token: "secret" } }))).toBe("sam.lee@example.com");
  });
  it("gives nothing rather than a wrong value", () => {
    expect(signedInEmail(folder(undefined))).toBeNull();
    expect(signedInEmail(folder("not json"))).toBeNull();
    expect(signedInEmail(folder({ tokens: {} }))).toBeNull();
    expect(signedInEmail(folder({ tokens: { id_token: "garbage" } }))).toBeNull();
    expect(signedInEmail(folder({ tokens: { id_token: jwt({ email: "no-at-sign" }) } }))).toBeNull();
  });
  it("labels the row with the e-mail masked like keys", () => {
    expect(planLabel("ChatGPT", "sam.lee@example.com")).toBe("ChatGPT · ••••.lee@example.com");
    expect(planLabel("Claude Max", "jo@x.io")).toBe("Claude Max · ••••@x.io");
    expect(planLabel("ChatGPT", null)).toBe("ChatGPT");
    expect(planLabel("ChatGPT", "odd value")).toBe("ChatGPT");
  });
});
