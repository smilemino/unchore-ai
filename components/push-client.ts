// Browser notifications on this device (web push — lib/push.ts sends them). Shared by Settings and the «thinking» line in the chat.
import { nativeBridge } from "./native-app";

export type PushState = "on" | "off" | "blocked" | "none";

/** Can this device be told when an answer is done? The Android app always can (it picks up lib/push.ts toApp). */
export async function pushState(): Promise<PushState> {
  if (nativeBridge()) return "on";
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) || typeof Notification === "undefined") return "none";
  if (Notification.permission === "denied") return "blocked";
  const reg = await navigator.serviceWorker.getRegistration("/sw.js").catch(() => undefined);
  const sub = await reg?.pushManager.getSubscription().catch(() => null);
  return sub ? "on" : "off";
}

/** Will «turn on» open the browser's Allow box? Then say where to click — the box opens far from the button and nothing on
 *  the page changes, so people kept pressing the button (AI Soul 2026-10-01). */
export function allowBoxOpens(): boolean {
  return !nativeBridge() && typeof Notification !== "undefined" && Notification.permission === "default";
}

/** Asks the browser, subscribes and tells the server. */
export async function enablePush(): Promise<PushState> {
  try {
    const { publicKey } = await fetch("/api/push").then((r) => r.json()) as { publicKey: string | null };
    if (!publicKey) return "none";
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return perm === "denied" ? "blocked" : "off";   // closed the box without choosing — not blocked, can ask again
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const key = Uint8Array.from(atob(publicKey.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    await fetch("/api/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON(), label: navigator.userAgent.slice(0, 60) }) });
    return "on";
  } catch { return "off"; }
}
