import { NextResponse } from "next/server";
import { isResp, requireUser } from "@/lib/api";
import { one, q } from "@/lib/db";
import { talkSay } from "@/lib/app-talk";

// The Android app (android/unchore-app) asks here every 15 minutes and on opening: «what was sent since «after»?»
// ?device=<random id the app made> registers the phone (lib/push.ts keeps notices only for members with the app).
// Fresh «your work is done» notices carry «say»: the app reads it aloud unless the phone is silent (lib/app-talk.ts).
// No «after» (first ask on a new phone): nothing old is shown — only where to start from.
export async function GET(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const sp = new URL(req.url).searchParams;
  const device = (sp.get("device") ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  if (device) await q(`insert into app_devices(user_id, device, label) values ($1, $2, $3)
    on conflict (user_id, device) do update set last_seen = now(), label = coalesce(excluded.label, app_devices.label)`, [u.id, device, (sp.get("label") ?? "").slice(0, 80) || null]);
  const after = /^\d{1,18}$/.test(sp.get("after") ?? "") ? sp.get("after")! : "";
  if (!after) {
    const last = await one<{ id: string | null }>("select max(id)::text as id from app_inbox where user_id = $1", [u.id]);
    return NextResponse.json({ items: [], last: last?.id ?? "0" }, { headers: { "cache-control": "no-store" } });
  }
  const rows = await q<{ id: string; title: string; body: string; url: string; tag: string | null; age_ms: number }>(
    `select id::text as id, title, body, url, tag, (extract(epoch from now() - created_at) * 1000)::float8 as age_ms from app_inbox
      where user_id = $1 and id > $2::bigint and created_at > now() - interval '1 day' order by id limit 20`, [u.id, after]);
  const items = rows.map(({ age_ms, ...r }) => ({ ...r, say: talkSay({ ...r, ageMs: age_ms }) }));
  const last = items.length ? items[items.length - 1]!.id : after;
  return NextResponse.json({ items, last, lang: u.lang || "en" }, { headers: { "cache-control": "no-store" } });
}
