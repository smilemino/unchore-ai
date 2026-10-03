import { afterEach, describe, expect, it } from "vitest";
import { changeGuide, shipOnlySecret } from "../lib/self-improve";
import { needsYes } from "../lib/tools/computer";

// Owner 2026-10-03: the owner's Unchore improves Unchore itself like AI Soul; other members change only their own screen.
describe("who may change Unchore", () => {
  const was = process.env.OWNER_EMAILS;
  afterEach(() => { process.env.OWNER_EMAILS = was; });

  it("the owner with a computer gets the self-improvement steps (branch, full check, ship after yes)", () => {
    process.env.OWNER_EMAILS = "boss@example.com";
    const g = changeGuide("Boss@Example.com", true);
    expect(g).toContain("Improving Unchore itself");
    expect(g).toContain("scripts/owner-check.sh");
    expect(g).toContain("scripts/owner-ship.sh");
    expect(g).toContain("git config user.email Boss@Example.com");
    expect(g).toContain("never skip");
  });

  it("the owner without tools (voice) gets nothing extra; a member always gets the own-screen limit", () => {
    process.env.OWNER_EMAILS = "boss@example.com";
    expect(changeGuide("boss@example.com", false)).toBe("");
    for (const e of ["someone@example.com", null, undefined]) {
      const g = changeGuide(e, true);
      expect(g).toContain("own Unchore screen");
      expect(g).not.toContain("owner-ship");
    }
  });

  it("Unchore's database secret goes only to the ship script", () => {
    expect(shipOnlySecret("GITHUB_TOKEN", "git push -u origin HEAD")).toBeNull();
    expect(shipOnlySecret("UNCHORE_DATABASE_URL", "bash scripts/owner-ship.sh")).toBeNull();
    expect(shipOnlySecret("UNCHORE_DATABASE_URL", "cd unchore && bash scripts/owner-ship.sh")).toBeNull();
    expect(shipOnlySecret("UNCHORE_DATABASE_URL", "psql $UNCHORE_DATABASE_URL -c 'delete from users'")).toMatch(/only given/);
    expect(shipOnlySecret("UNCHORE_DATABASE_URL", "bash scripts/owner-ship.sh; env")).toMatch(/only given/);
  });

  it("pushing a branch runs without a yes; pushing main still waits for it", () => {
    expect(needsYes("git push -u origin HEAD")).toBeNull();
    expect(needsYes("git push origin HEAD:main")).not.toBeNull();
  });
});
