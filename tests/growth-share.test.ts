// Growth wheel (plan v11 §13 A·B): where a member came from, «send to a friend», and the friend's link.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import { cleanSource, newRefCode, shareUrl } from "@/lib/growth-source";
import { RECIPE_TITLES } from "@/lib/recipe-titles";
import { RECIPES } from "@/lib/recipes";

describe("source and share link (no database)", () => {
  it("keeps only the three plain shapes", () => {
    expect(cleanSource("ref:abcd2345")).toBe("ref:abcd2345");
    expect(cleanSource(encodeURIComponent("utm:reddit/r-ClaudeAI"))).toBe("utm:reddit/r-ClaudeAI");
    expect(cleanSource("site:news.ycombinator.com")).toBe("site:news.ycombinator.com");
    expect(cleanSource("ref:ABC")).toBeNull();                       // not a code we make
    expect(cleanSource("utm:<script>")).toBeNull();
    expect(cleanSource("mail:someone@x.com")).toBeNull();
    expect(cleanSource("%E0%A4%A")).toBeNull();                      // broken escape
    expect(cleanSource(null)).toBeNull();
  });
  it("makes readable codes and a link without the member's settings", () => {
    const c = newRefCode();
    expect(c).toMatch(/^[a-z2-9]{8}$/);
    expect(c).not.toMatch(/[01ol]/);
    expect(shareUrl(c, "fx")).toBe(`https://unchore.ai/?ref=${c}&try=fx`);
    expect(shareUrl(c, "bad recipe!")).toBe(`https://unchore.ai/?ref=${c}`);
  });
  it("names every recipe the browser may show, the same way the recipes do", () => {
    expect(Object.keys(RECIPE_TITLES).sort()).toEqual(RECIPES.map((r) => r.id).sort());
    for (const r of RECIPES) expect(RECIPE_TITLES[r.id]).toBe((r as unknown as { title: { en: string } }).title.en);
  });
});

const URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL)("source and friend link (database)", () => {
  let db: typeof import("@/lib/db");
  let gs: typeof import("@/lib/growth-source");
  const mk = async () => (await db.one<{ id: string }>("insert into users(email) values ($1) returning id", [`g-${randomUUID()}@t.test`]))!.id;
  const row = (id: string) => db.one<{ source: string | null; ref_by: string | null; ref_code: string | null }>("select source, ref_by, ref_code from users where id = $1", [id]);

  beforeAll(async () => {
    const name = `uc_growth_${randomUUID().slice(0, 8)}`;
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query(`create database ${name}`);
    for (let i = 0; i < 20 && !(await admin.query("select 1 from pg_roles where rolname = 'unchore_member'")).rowCount; i++) await new Promise((r) => setTimeout(r, 250));
    await admin.query("do $$ begin create role unchore_member nologin; exception when duplicate_object or unique_violation then null; end $$");
    await admin.end();
    const url = new globalThis.URL(URL!); url.pathname = `/${name}`;
    process.env.DATABASE_URL = url.toString();
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: "pipe" });
    db = await import("@/lib/db");
    gs = await import("@/lib/growth-source");
  }, 30_000);

  it("a friend's code: remembers who sent them, once; the code stays the same", async () => {
    const a = await mk();
    const code = await db.asMember(a, () => gs.myRefCode(a));
    expect(await db.asMember(a, () => gs.myRefCode(a))).toBe(code);
    const b = await mk();
    await gs.applySource(b, `ref:${code}`);
    await gs.applySource(b, "utm:x/y");                 // first touch stays
    expect(await row(b)).toMatchObject({ source: `ref:${code}`, ref_by: a });
  });
  it("never yourself, unknown codes only keep the source, junk keeps nothing", async () => {
    const a = await mk();
    const code = await db.asMember(a, () => gs.myRefCode(a));
    await gs.applySource(a, `ref:${code}`);
    expect((await row(a))!.ref_by).toBeNull();
    const c = await mk();
    await gs.applySource(c, "ref:zzzzzzzz");
    expect(await row(c)).toMatchObject({ source: "ref:zzzzzzzz", ref_by: null });
    const d = await mk();
    await gs.applySource(d, "<b>");
    expect((await row(d))!.source).toBeNull();
  });
  it("a new account through upsertUser still signs in (no request cookie in tests)", async () => {
    const s = await import("@/lib/session");
    const id = await s.upsertUser(`u-${randomUUID()}@t.test`, { lang: "en" });
    expect(await s.upsertUser((await db.one<{ email: string }>("select email from users where id = $1", [id]))!.email, {})).toBe(id);
  });
});
