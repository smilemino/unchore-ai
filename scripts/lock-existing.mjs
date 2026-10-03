// Locks chat text written before locking was switched on (messages, titles, summaries, memories, files).
// Dry run by default; add --apply to write. Usage: DATABASE_URL=... UNCHORE_SECRET_KEY=... node scripts/lock-existing.mjs [--apply]
// Same format as lib/privacy.ts: text → "enc:v1.<iv>.<tag>.<body>", bytes → "UCE1"+iv+tag+body.
import pg from "pg";
import { createCipheriv, randomBytes } from "node:crypto";

const url = process.env.DATABASE_URL;
const key = Buffer.from(process.env.UNCHORE_SECRET_KEY ?? "", "base64");
if (!url || key.length !== 32) { console.error("DATABASE_URL and a 32-byte UNCHORE_SECRET_KEY are needed"); process.exit(1); }
const apply = process.argv.includes("--apply");
const MAGIC = Buffer.from("UCE1");

function lock(plain) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return "enc:" + ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), body.toString("base64")].join(".");
}
function lockBytes(plain) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), body]);
}

const local = /localhost|127\.0\.0\.1|\/tmp/.test(url);
const db = new pg.Client({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false } });
await db.connect();
const TEXT = [["messages", "content"], ["conversations", "title"], ["conversations", "summary"], ["memories", "text"], ["files", "text_extract"]];
const out = {};
for (const [t, c] of TEXT) {
  const rows = (await db.query(`select id, ${c} as v from ${t} where ${c} is not null and ${c} not like 'enc:%'`)).rows;
  out[`${t}.${c}`] = rows.length;
  if (apply) for (const r of rows) await db.query(`update ${t} set ${c} = $2 where id = $1 and ${c} = $3`, [r.id, lock(r.v), r.v]);
}
const files = (await db.query("select id, data from files where substring(data from 1 for 4) <> $1::bytea", [MAGIC])).rows;
out["files.data"] = files.length;
if (apply) for (const f of files) await db.query("update files set data = $2 where id = $1 and substring(data from 1 for 4) <> $3::bytea", [f.id, lockBytes(f.data), MAGIC]);
console.log(JSON.stringify({ apply, plain_rows: out }));
await db.end();
