import { tr } from "@/lib/i18n-server";
import { NextResponse } from "next/server";
import { isResp, requireUser } from "@/lib/api";
import { one, q } from "@/lib/db";
import { parseSubscription, pushUser, vapidPublic } from "@/lib/push";

export async function GET() {
  const u = await requireUser();
  if (isResp(u)) return u;
  const n = await one<{ n: number }>("select count(*)::int as n from push_subscriptions where user_id = $1", [u.id]);
  return NextResponse.json({ publicKey: vapidPublic(), devices: n?.n ?? 0 });
}
// Body: {subscription, label} to add · {test:true} to send a test · DELETE with {endpoint} to remove.
export async function POST(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const b = (await req.json().catch(() => ({}))) as { subscription?: unknown; label?: string; test?: boolean };
  if (b.test) return NextResponse.json({ sent: await pushUser(u.id, { title: "Unchore", body: tr(u.lang, "Notifications are on"), url: "/app", tag: "unchore-test" }) });
  const s = parseSubscription(b.subscription);
  if (!s) return NextResponse.json({ error: "bad_subscription" }, { status: 400 });
  await q(`insert into push_subscriptions(user_id, endpoint, p256dh, auth, label) values ($1,$2,$3,$4,$5)
    on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, label = excluded.label`, [u.id, s.endpoint, s.p256dh, s.auth, (b.label ?? "").slice(0, 80)]);
  return NextResponse.json({ ok: true });
}
export async function DELETE(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const b = (await req.json().catch(() => ({}))) as { endpoint?: string };
  if (b.endpoint) await q("delete from push_subscriptions where user_id = $1 and endpoint = $2", [u.id, b.endpoint]);
  else await q("delete from push_subscriptions where user_id = $1", [u.id]);
  return NextResponse.json({ ok: true });
}
