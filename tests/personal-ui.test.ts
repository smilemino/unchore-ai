import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { Design, Edit, appPath, tipDue, TIP_GAP, validRect } from "@/lib/personal-ui/schema";
import { readScreenMark } from "@/lib/personal-ui/marks";
import { hideMarks } from "@/lib/chat-setup";
const design = { title: "My dashboard", html: '<div id="uc-content"></div>', css: "#uc-content{width:100%;height:100%}", js: "" };
describe("personal screen contracts", () => {
  it("handles computer and voice output, hiding unfinished code and refusing duplicate edits", () => {
    const block = "```unchore-screen\n" + JSON.stringify({ action: "save", base: 0, design }) + "\n```";
    expect(readScreenMark("Checking now.\n" + block).edit).toMatchObject({ action: "save", base: 0 });
    expect(readScreenMark(block + block).edit).toBeUndefined();
    expect(readScreenMark("```unchore-screen\nbroken\n```").invalid).toBe(true);
    expect(hideMarks("Checking.\n```unchore-screen\n{\"action\":" )).toBe("Checking.");
  });
  it("accepts code, rejects oversized designs and invented backend actions", () => {
    expect(Design.parse(design)).toEqual(design);
    expect(Design.safeParse({ ...design, js: "a".repeat(100001) }).success).toBe(false);
    expect(Edit.safeParse({ action: "save", base: 0, design, userId: randomUUID() }).success).toBe(false);
    expect(Edit.safeParse({ action: "pay", base: 0 }).success).toBe(false);
  });
  it("keeps native chat usable even on narrow phones", () => {
    expect(validRect({ x: 0, y: 0, width: 280, height: 300 }, 360, 700)).toBe(true);
    for (const r of [{ x: -1, y: 0, width: 280, height: 300 }, { x: 0, y: 0, width: 100, height: 10 }, { x: 0, y: 0, width: NaN, height: 300 }, { x: 100, y: 0, width: 280, height: 300 }]) expect(validRect(r, 360, 700)).toBe(false);
    expect(validRect({ x: 0, y: 0, width: 240, height: 220 }, 240, 220)).toBe(true);
  });
  it("never routes custom code to payments, deletes or outside pages", () => {
    expect(appPath("/app/settings")).toBe("/app/settings");
    for (const p of ["//evil.test", "javascript:alert(1)", "/api/settings", "/app/../api/settings", "/app?redirect=https://evil.test", "/app/settings?delete=1"]) expect(appPath(p)).toBeNull();
  });
  it("shows tips at most three times, at least fourteen days apart, until used or hidden", () => {
    const now = Date.now();
    expect(tipDue(0, null, false, false, now)).toBe(true);
    expect(tipDue(1, new Date(now - TIP_GAP + 1).toISOString(), false, false, now)).toBe(false);
    expect(tipDue(2, new Date(now - TIP_GAP).toISOString(), false, false, now)).toBe(true);
    expect(tipDue(3, null, false, false)).toBe(false);
    expect(tipDue(0, null, true, false)).toBe(false);
    expect(tipDue(0, null, false, true)).toBe(false);
  });
});
const URL = process.env.TEST_DATABASE_URL;
describe.skipIf(!URL)("personal screens with real Postgres", () => {
  let db: typeof import("@/lib/db"), store: typeof import("@/lib/personal-ui/store");
  let a: string, b: string;
  beforeAll(async () => {
    process.env.DATABASE_URL = URL;
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: URL }, stdio: "pipe" });
    db = await import("@/lib/db"); store = await import("@/lib/personal-ui/store");
    a = (await db.one<{ id: string }>("insert into users(email) values($1) returning id", [`pui-a-${randomUUID()}@test.invalid`]))!.id;
    b = (await db.one<{ id: string }>("insert into users(email) values($1) returning id", [`pui-b-${randomUUID()}@test.invalid`]))!.id;
  });
  it("keeps the original screen until checked, persists revisions, preserves a good screen when a draft fails", async () => {
    expect((await store.readUI(a)).design).toBeNull();
    const s = await store.editUI(a, { action: "save", base: 0, design });
    expect(s.active).toBeNull(); expect(s.pending).toBe(1);
    await db.asMember(a, () => store.checkUI(a, 1, true));
    expect((await store.readUI(a)).design).toEqual(design);
    await store.editUI(a, { action: "save", base: 1, design: { ...design, js: "throw Error('bad')" } });
    await db.asMember(a, () => store.checkUI(a, 2, false));
    const after = await store.readUI(a);
    expect(after.active).toBe(1); expect(after.pending).toBeNull(); expect(after.history).toHaveLength(2);
    const encrypted = await db.one<{ design: string }>("select design from personal_ui_versions where user_id=$1 and version=1", [a]);
    expect(encrypted!.design).not.toContain("My dashboard");
  });
  it("two edits of one revision cannot overwrite each other", async () => {
    const results = await Promise.allSettled([store.editUI(a, { action: "save", base: 2, design }), store.editUI(a, { action: "save", base: 2, design })]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await store.readUI(a)).revision).toBe(3);
    expect(await db.asMember(a, () => store.checkUI(a, 2, true))).toBeNull();
  });
  it("cannot read, activate, replace or write another member's screen or data", async () => {
    await store.editUI(b, { action: "save", base: 0, design: { ...design, title: "B private" } });
    await db.asMember(b, () => db.q("insert into personal_ui_data(user_id,key,value) values($1,'tasks','secret')", [b]));
    await db.asMember(a, async () => {
      expect(await db.q("select * from personal_ui_versions where user_id=$1", [b])).toEqual([]);
      expect(await db.q("select * from personal_ui_data where user_id=$1", [b])).toEqual([]);
      expect(await store.checkUI(b, 1, true)).toBeNull();
      await expect(db.q("insert into personal_ui_versions(user_id,version,design) values($1,99,'attack')", [b])).rejects.toThrow(/row-level security/);
    });
    expect((await store.readUI(b)).pending).toBe(1);
  });
  it("restores a prior design through validation, and can always reset to the original", async () => {
    await store.editUI(a, { action: "restore", base: 3, version: 1 });
    expect((await store.readUI(a)).pending).toBe(1);
    await store.editUI(a, { action: "restore", base: 4, version: null });
    expect((await store.readUI(a)).design).toBeNull();
    await expect(store.editUI(a, { action: "restore", base: 5, version: 99 })).rejects.toThrow();
  });
  it("only one device claims a tip, used members never receive it", async () => {
    const results = await db.asMember(b, () => Promise.all([store.claimTip(b), store.claimTip(b)]));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await db.asMember(a, () => store.claimTip(a))).toBe(false);
  });
});
