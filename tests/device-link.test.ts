// Getting into the Android app without Google (ported from AI Soul «other-device sign-in link», 2026-10-02):
// e-mail links asked from inside the app, and links made in Settings, open under /app so the app catches them (App Links).
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ rows: [] as unknown[][], recent: 0 }));
const user = vi.hoisted(() => ({ me: null as null | { id: string; email: string; lang: string; tz: string } }));
const mail = vi.hoisted(() => ({ sent: [] as string[] }));
vi.mock("@/lib/db", () => ({
  q: async (_sql: string, params: unknown[]) => { db.rows.push(params); return []; },
  one: async () => ({ n: db.recent }),
}));
vi.mock("@/lib/session", () => ({ currentUser: async () => user.me }));
vi.mock("@/lib/mail", () => ({ esc: (s: string) => s, sendMail: async (_to: string, _s: string, _h: string, text: string) => { mail.sent.push(text); return true; } }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

import { appSignInUrl, inAppView } from "@/lib/app-login";

beforeEach(() => { db.rows = []; db.recent = 0; mail.sent = []; user.me = null; delete process.env.UNCHORE_GOOGLE_CLIENT_ID; process.env.APP_URL = "https://unchore.ai"; });

describe("sign-in links the app opens", () => {
  it("knows the app's own web view by its user agent", () => {
    expect(inAppView(new Request("https://unchore.ai/x", { headers: { "user-agent": "Mozilla/5.0 (Linux; Android 14; wv) Chrome/129 Mobile UnchoreApp/1" } }))).toBe(true);
    expect(inAppView(new Request("https://unchore.ai/x", { headers: { "user-agent": "Mozilla/5.0 Chrome/129 Mobile" } }))).toBe(false);
    expect(inAppView(new Request("https://unchore.ai/x"))).toBe(false);
  });
  it("the link sits under /app, which the app claims", () => {
    expect(appSignInUrl("https://unchore.ai", "a b")).toBe("https://unchore.ai/app/signin?t=a%20b");
    const manifest = readFileSync("android/unchore-app/AndroidManifest.xml", "utf8");
    expect(manifest).toContain('android:pathPrefix="/app"');
  });
  it("/app/signin checks the token exactly like the e-mail link", async () => {
    const a = await import("@/app/app/signin/route");
    const b = await import("@/app/api/auth/email/verify/route");
    expect(a.GET).toBe(b.GET);
  });

  it("e-mail asked inside the app gets the /app link; in a browser, the usual one", async () => {
    const { POST } = await import("@/app/api/auth/email/route");
    const ask = (ua: string) => POST(new Request("https://unchore.ai/api/auth/email", { method: "POST", headers: { "user-agent": ua }, body: JSON.stringify({ email: "Me@T.Test" }) }));
    expect((await ask("Mozilla/5.0 wv UnchoreApp/1")).status).toBe(200);
    expect((await ask("Mozilla/5.0 Chrome")).status).toBe(200);
    expect(mail.sent[0]).toMatch(/https:\/\/unchore\.ai\/app\/signin\?t=[\w-]+$/);
    expect(mail.sent[1]).toMatch(/https:\/\/unchore\.ai\/api\/auth\/email\/verify\?t=[\w-]+$/);
  });
});

describe("«Make a sign-in link» in Settings", () => {
  it("needs a signed-in member", async () => {
    const { POST } = await import("@/app/api/auth/device-link/route");
    expect((await POST(new Request("https://unchore.ai/api/auth/device-link", { method: "POST" }))).status).toBe(401);
    expect(db.rows).toHaveLength(0);
  });
  it("makes a one-time link for that member only, and stops after 5 in the hour", async () => {
    const { POST } = await import("@/app/api/auth/device-link/route");
    user.me = { id: "u1", email: "Me@T.Test", lang: "ko", tz: "Asia/Seoul" };
    const r = await POST(new Request("https://unchore.ai/api/auth/device-link", { method: "POST" }));
    const j = (await r.json()) as { url: string };
    expect(j.url).toMatch(/^https:\/\/unchore\.ai\/app\/signin\?t=[\w-]{20,}$/);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(db.rows[0]!.slice(1)).toEqual(["me@t.test", "ko", "Asia/Seoul"]);
    expect(db.rows[0]![0]).not.toContain(new URL(j.url).searchParams.get("t"));   // only the hash is kept
    db.recent = 5;
    expect((await POST(new Request("https://unchore.ai/api/auth/device-link", { method: "POST" }))).status).toBe(429);
    expect(db.rows).toHaveLength(1);
  });
});
