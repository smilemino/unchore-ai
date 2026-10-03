// Web push (ported from AI Soul): the browser subscribes, we sign with VAPID and send; the push service can't read the text.
import webpush from "web-push";
import { q } from "./db";
import { toTelegram } from "./telegram";

const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /^([a-z0-9-]+\.)*push\.apple\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^[a-z0-9-]+\.notify\.windows\.com$/];
export function pushEndpointAllowed(endpoint: string): boolean {
  try { const u = new URL(endpoint); return u.protocol === "https:" && !u.port && PUSH_HOSTS.some((h) => h.test(u.hostname)); } catch { return false; }
}
export function parseSubscription(v: unknown): { endpoint: string; p256dh: string; auth: string } | null {
  const s = v as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  if (!s || typeof s.endpoint !== "string" || s.endpoint.length > 2000 || !pushEndpointAllowed(s.endpoint)) return null;
  const p = s.keys?.p256dh, a = s.keys?.auth, b64u = /^[A-Za-z0-9_-]+=*$/;
  if (typeof p !== "string" || typeof a !== "string" || !b64u.test(p) || !b64u.test(a) || p.length > 200 || a.length > 100) return null;
  return { endpoint: s.endpoint, p256dh: p, auth: a };
}
export function vapidPublic(): string | null { return process.env.VAPID_PUBLIC_KEY ?? null; }

/** Sends to every device of the user. Dead endpoints (404/410) are removed. Never throws. */
export async function pushUser(userId: string, msg: { title: string; body: string; url: string; tag?: string }): Promise<number> {
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  const app = (await toApp(userId, msg)) + (await toTelegram(userId, msg));
  if (!pub || !priv) return app;
  const subs = await q<{ id: string; endpoint: string; p256dh: string; auth: string }>("select id, endpoint, p256dh, auth from push_subscriptions where user_id = $1", [userId]).catch(() => []);
  let ok = 0;
  // Right after a device turns notices on, Google sometimes answers the first test with 410 (AI Soul gate, 9/30–10/2) —
  // for the test only, try twice more 5 s apart before removing the device.
  const tries = msg.tag === "unchore-test" ? 3 : 1;
  await Promise.all(subs.map(async (s) => {
    for (let attempt = 1; attempt <= tries; attempt++) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: msg.title.slice(0, 80), body: msg.body.slice(0, 160), url: msg.url, tag: msg.tag ?? "unchore" }),
          { vapidDetails: { subject: "mailto:hello@unchore.ai", publicKey: pub, privateKey: priv }, TTL: 3600, urgency: "high", timeout: 15_000 });
        ok++; return;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code !== 404 && code !== 410) return;
        if (attempt < tries) { await new Promise((r) => setTimeout(r, 5000)); continue; }
        await q("delete from push_subscriptions where id = $1", [s.id]).catch(() => {});
      }
    }
  }));
  return ok + app;
}

/** The Android app can't get web push (a web view), so it picks these up every 15 minutes and on opening (/api/push/app).
 *  Only for members who have the app; older than 3 days are dropped. Returns 1 when kept for the app. Never throws. */
async function toApp(userId: string, msg: { title: string; body: string; url: string; tag?: string }): Promise<number> {
  try {
    const r = await q<{ id: string }>(`insert into app_inbox(user_id, title, body, url, tag)
      select $1, $2, $3, $4, $5 where exists (select 1 from app_devices where user_id = $1 and last_seen > now() - interval '30 days') returning id`,
      [userId, msg.title.slice(0, 80), msg.body.slice(0, 160), msg.url, msg.tag ?? "unchore"]);
    if (r.length) await q("delete from app_inbox where user_id = $1 and created_at < now() - interval '3 days'", [userId]);
    return r.length;
  } catch { return 0; }
}
