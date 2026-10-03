import { NextResponse } from "next/server";
import { z } from "zod";
import { isResp, requireUser } from "@/lib/api";
import { fastModel, userKeys } from "@/lib/ai";
import { one, q } from "@/lib/db";
import { lock, unlockBytes } from "@/lib/privacy";
import { speechWords, speechWordsBig } from "@/lib/media-text";
import { DAY_SECONDS, ONE_SECONDS, firstSince, isCallAudio, keepWords, localStamp, parseCallName, reserveFor } from "@/lib/call-intake";

export const maxDuration = 300;

// Calls → requests (lib/call-intake.ts). GET: is it on, today's minutes, calls waiting. PUT {on, consent}: turn on (only with the
// consent tick) or off. POST {fileId, seconds?, modified?}: one call recording the member just uploaded (app/api/files, or in
// pieces) → its words, kept locked; the sound file is deleted whatever happens.
const today = "created_at >= (date_trunc('day', now() at time zone $2) at time zone $2)";

export async function GET() {
  const u = await requireUser();
  if (isResp(u)) return u;
  const r = await one<{ on: string | null; since: string | null; used: number; waiting: number; done: number }>(
    `select u.call_intake_at as on, u.call_intake_since as since,
       (select coalesce(sum(seconds), 0)::int from call_imports where user_id = $1 and ${today}) as used,
       (select count(*)::int from call_imports where user_id = $1 and state = 'heard') as waiting,
       (select count(*)::int from call_imports where user_id = $1 and state = 'done') as done
     from users u where u.id = $1`, [u.id, u.tz || "UTC"]);
  return NextResponse.json({ on: !!r?.on, since: r?.since ?? null, used: r?.used ?? 0, max: DAY_SECONDS, waiting: r?.waiting ?? 0, done: r?.done ?? 0, hasKey: !!fastModel(await userKeys(u.id)) });
}

const Turn = z.object({ on: z.boolean(), consent: z.boolean().optional() });

export async function PUT(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const b = Turn.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  if (!b.data.on) { await q("update users set call_intake_at = null where id = $1", [u.id]); return NextResponse.json({ ok: true, on: false }); }
  if (b.data.consent !== true) return NextResponse.json({ error: "consent" }, { status: 400 });
  await q("update users set call_intake_at = now(), call_intake_since = coalesce(call_intake_since, $2) where id = $1", [u.id, firstSince(Date.now(), u.tz || "UTC")]);
  return NextResponse.json({ ok: true, on: true });
}

const Add = z.object({ fileId: z.string().uuid(), seconds: z.number().nonnegative().optional(), modified: z.number().int().positive().optional() });

export async function POST(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const b = Add.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  const me = await one<{ on: string | null; since: string | null }>("select call_intake_at as on, call_intake_since as since from users where id = $1", [u.id]);
  if (!me?.on) return NextResponse.json({ error: "off" }, { status: 409 });
  const f = await one<{ id: string; name: string; mime: string; size: number; parts_of: string | null }>(
    "select id, name, mime, size, parts_of from files where id = $1 and user_id = $2 and conversation_id is null", [b.data.fileId, u.id]);
  if (!f) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!isCallAudio(f.name, f.mime)) return NextResponse.json({ error: "not_audio" }, { status: 400 });
  const drop = async () => {   // the sound never stays (term ④)
    const gone = await one<{ parts_of: string | null }>("delete from files where id = $1 and user_id = $2 returning parts_of", [f.id, u.id]);
    if (gone?.parts_of) await q("delete from upload_parts where upload_id = $1 and user_id = $2", [gone.parts_of, u.id]);
  };
  const tz = u.tz || "UTC", name = parseCallName(f.name);
  const at = name.at ?? localStamp(b.data.modified ?? Date.now(), tz);
  if (me.since && at < me.since) { await drop(); return NextResponse.json({ error: "before_start", since: me.since }, { status: 400 }); }
  // Today's minutes, taken before the words are read (two recordings sent at once can each pass — one recording over, at most).
  const need = reserveFor(b.data.seconds);
  const row = await one<{ id: string }>(
    `insert into call_imports(user_id, name, who, called_at, seconds) select $1, $3, $4, $5, $6
     where (select coalesce(sum(seconds), 0) from call_imports where user_id = $1 and ${today}) + $6 <= $7 returning id`,
    [u.id, tz, f.name.slice(0, 200), name.who, at, need, DAY_SECONDS]);
  if (!row) { await drop(); return NextResponse.json({ error: "daily_cap" }, { status: 429 }); }
  let w: Awaited<ReturnType<typeof speechWords>> = null;
  try {
    if (f.parts_of) w = await speechWordsBig(f.parts_of, f.size);
    else { const d = await one<{ data: Buffer }>("select data from files where id = $1", [f.id]); if (d) w = await speechWords(unlockBytes(d.data)); }
  } catch { w = null; }
  finally { await drop(); }
  if (!w) { await q("update call_imports set state = 'failed', seconds = 0, done_at = now() where id = $1", [row.id]); return NextResponse.json({ error: "not_heard" }, { status: 502 }); }
  const secs = Math.min((w.seconds ?? 0) > 0 ? w.seconds! : need, ONE_SECONDS);
  await q("update call_imports set state = 'heard', words = $2, seconds = $3 where id = $1", [row.id, lock(keepWords(w.text.trim())), secs]);
  return NextResponse.json({ ok: true, who: name.who, at, seconds: secs, cut: w.cut === true });
}
