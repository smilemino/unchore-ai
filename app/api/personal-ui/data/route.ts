import { NextResponse } from "next/server";
import { z } from "zod";
import { isResp, requireUser } from "@/lib/api";
import { one } from "@/lib/db";
import { lock, unlock } from "@/lib/privacy";
import { KEY } from "@/lib/personal-ui/schema";
const Body = z.object({ key: KEY, value: z.unknown(), revision: z.number().int().nonnegative() }).strict();
export async function GET(req: Request) {
  const u = await requireUser(); if (isResp(u)) return u;
  const key = KEY.safeParse(new URL(req.url).searchParams.get("key"));
  if (!key.success) return NextResponse.json({ error: "bad_key" }, { status: 400 });
  const r = await one<{ value: string; revision: number }>("select value,revision from personal_ui_data where user_id=$1 and key=$2", [u.id, key.data]);
  return NextResponse.json(r ? { value: JSON.parse(unlock(r.value)), revision: r.revision } : { value: null, revision: 0 });
}
export async function POST(req: Request) {
  const u = await requireUser(); if (isResp(u)) return u;
  const text = await req.text();
  if (text.length > 64_000) return NextResponse.json({ error: "too_large" }, { status: 413 });
  let parsed: unknown; try { parsed = JSON.parse(text); } catch { return NextResponse.json({ error: "bad_input" }, { status: 400 }); }
  const b = Body.safeParse(parsed);
  if (!b.success || b.data.value === undefined) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  const { key, value, revision } = b.data;
  const encoded = lock(JSON.stringify(value));
  const r = revision === 0
    ? await one("insert into personal_ui_data(user_id,key,value) select $1,$2,$3 where (select count(*) from personal_ui_data where user_id=$1)<100 on conflict do nothing returning revision", [u.id, key, encoded])
    : await one("update personal_ui_data set value=$3,revision=revision+1 where user_id=$1 and key=$2 and revision=$4 returning revision", [u.id, key, encoded, revision]);
  return NextResponse.json(r ?? { error: "Data changed on another screen. Read it again." }, { status: r ? 200 : 409 });
}
