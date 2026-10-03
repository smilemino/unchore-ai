// Applies db/migrations/*.sql in order, once each. Usage: DATABASE_URL=... node scripts/migrate.mjs
import pg from "pg";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set"); process.exit(1); }
const local = /localhost|127\.0\.0\.1|\/tmp/.test(url);
const client = new pg.Client({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false } });
await client.connect();
// One at a time: test files (and two deploys) may migrate the same database together — «tuple concurrently updated» / duplicate pg_type (2026-10-02).
await client.query("select pg_advisory_lock(7310712)");
await client.query("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
const dir = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "db", "migrations");
for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
  const done = await client.query("select 1 from schema_migrations where name=$1", [f]);
  if (done.rowCount) continue;
  await client.query("begin");
  try {
    await client.query(readFileSync(path.join(dir, f), "utf8"));
    await client.query("insert into schema_migrations(name) values ($1)", [f]);
    await client.query("commit");
    console.log("applied", f);
  } catch (e) {
    await client.query("rollback");
    console.error("failed", f, e.message);
    process.exit(1);
  }
}
// Member lock: fence every table again, so tables added by any migration (or by hand) are covered (005_member_lock.sql).
if ((await client.query("select 1 from pg_proc where proname = 'uc_lock_tables'")).rowCount) await client.query("select uc_lock_tables()");
await client.query("select pg_advisory_unlock(7310712)");
await client.end();
