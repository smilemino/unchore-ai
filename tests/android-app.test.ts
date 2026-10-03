// Android app (android/unchore-app · owner 2026-09-30): sign-in handed from the phone's browser to the app, the App Links file,
// notifications kept for members with the app, and the page's bridge to the phone's own dictation and voice.
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { APP_CERTS, APP_PACKAGE, appIntent, appNonce, fromApp } from "@/lib/app-login";

describe("sign-in handoff and App Links", () => {
  it("the intent opens only our package, with the one-time link and the app's own nonce", () => {
    const u = appIntent("abc_DEF-123", "N0nce0000000000000");
    expect(u).toBe("intent://login?t=abc_DEF-123&n=N0nce0000000000000#Intent;scheme=unchore;package=ai.unchore.app;end");
    expect(appIntent("a b&c", "x")).toContain("t=a%20b%26c");
  });
  it("only a start from the app with a proper nonce counts (the app refuses links without its nonce)", () => {
    expect(fromApp(new Request("https://unchore.ai/api/auth/google/start?app=1&n=abcdefghijklmnop1234"))).toBe("abcdefghijklmnop1234");
    expect(fromApp(new Request("https://unchore.ai/api/auth/google/start?app=1"))).toBeNull();
    expect(fromApp(new Request("https://unchore.ai/api/auth/google/start?app=1&n=short"))).toBeNull();
    expect(fromApp(new Request("https://unchore.ai/api/auth/google/start?n=abcdefghijklmnop1234"))).toBeNull();
    expect(appNonce("abcdefghijklmnop1234")).toBe("abcdefghijklmnop1234");
    expect(appNonce("1")).toBeNull();
    expect(appNonce(undefined)).toBeNull();
  });
  it("assetlinks.json names the app and its signing print", async () => {
    const { GET } = await import("@/app/.well-known/assetlinks.json/route");
    const j = (await GET().json()) as { target: { package_name: string; sha256_cert_fingerprints: string[] } }[];
    expect(j[0]!.target.package_name).toBe(APP_PACKAGE);
    expect(j[0]!.target.sha256_cert_fingerprints).toEqual(APP_CERTS);
    for (const c of APP_CERTS) expect(c).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
  });
});

describe("the page's bridge to the phone's voice (components/native-app.ts)", () => {
  const calls: unknown[][] = [];
  const bridge = {
    srStart: (l: string) => calls.push(["sr", l]), srAbort: () => calls.push(["abort"]),
    ttsSpeak: (id: string, text: string, rate: number, lang: string) => calls.push(["tts", id, text, rate, lang]), ttsCancel: () => calls.push(["cancel"]),
    voiceSession: (on: boolean) => calls.push(["session", on]), voiceView: (p: string, l: string) => calls.push(["view", p, l]),
  };
  type Rec = { lang: string; start(): void; abort(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onend: (() => void) | null };
  type Win = { UnchoreAndroid: typeof bridge; __ucNative: (e: unknown) => void; webkitSpeechRecognition: new () => Rec;
    speechSynthesis: { speaking: boolean; speak(u: unknown): void; cancel(): void }; SpeechSynthesisUtterance: new (t: string) => { lang: string; onend: (() => void) | null } };
  let w: Win;
  let mod: typeof import("@/components/native-app");
  beforeAll(async () => {
    vi.stubGlobal("window", { UnchoreAndroid: bridge });
    vi.stubGlobal("document", { documentElement: { lang: "en" } });
    mod = await import("@/components/native-app");
    w = globalThis.window as unknown as Win;
  });
  afterAll(() => vi.unstubAllGlobals());

  it("dictation in the member's language, results and end come back from the app", () => {
    const r = new w.webkitSpeechRecognition();
    r.lang = "ja-JP";
    const heard: string[] = []; let ended = false;
    r.onresult = (e) => heard.push(e.results[0]![0]!.transcript + (e.results[0]!.isFinal ? "!" : ""));
    r.onend = () => { ended = true; };
    r.start();
    expect(calls.at(-1)).toEqual(["sr", "ja-JP"]);
    w.__ucNative({ type: "sr", ev: "result", text: "こんに", final: false });
    w.__ucNative({ type: "sr", ev: "result", text: "こんにちは", final: true });
    w.__ucNative({ type: "sr", ev: "end" });
    expect(heard).toEqual(["こんに", "こんにちは!"]);
    expect(ended).toBe(true);
  });
  it("reading aloud passes the language, and «speaking» follows the app until each line ends", () => {
    const u = new w.SpeechSynthesisUtterance("Hola");
    u.lang = "es-ES";
    let done = false; u.onend = () => { done = true; };
    w.speechSynthesis.speak(u);
    const sent = calls.at(-1)!;
    expect(sent.slice(0, 2)).toEqual(["tts", sent[1]]);
    expect(sent.slice(2)).toEqual(["Hola", 1, "es-ES"]);
    expect(w.speechSynthesis.speaking).toBe(true);
    w.__ucNative({ type: "tts", ev: "end", id: sent[1] });
    expect(done).toBe(true);
    expect(w.speechSynthesis.speaking).toBe(false);
  });
  it("phone calls and the app's buttons reach voice mode; the small window gets each state once", () => {
    const got: string[] = [];
    mod.setNativeControl({ call: (on) => got.push(on ? "call" : "hang up"), interrupt: () => got.push("listen"), end: () => got.push("end") });
    w.__ucNative({ type: "call", ev: "start" });
    w.__ucNative({ type: "call", ev: "end" });
    w.__ucNative({ type: "ctl", ev: "interrupt" });
    w.__ucNative({ type: "ctl", ev: "end" });
    expect(got).toEqual(["call", "hang up", "listen", "end"]);
    mod.setNativeControl(null);
    const before = calls.length;
    mod.nativeView("thinking", ""); mod.nativeView("thinking", "");
    expect(calls.length - before).toBe(1);
    mod.nativeVoiceSession(true);
    expect(calls.at(-1)).toEqual(["session", true]);
  });
});

const URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL)("app sign-in and notices in the database", () => {
  let db: typeof import("@/lib/db");
  let a = "", b = "";
  beforeAll(async () => {
    const name = `uc_app_${randomUUID().slice(0, 8)}`;
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query(`create database ${name}`);
    await admin.query("do $$ begin create role unchore_member nologin; exception when duplicate_object or unique_violation then null; end $$");
    await admin.end();
    const url = new globalThis.URL(URL!); url.pathname = `/${name}`;
    process.env.DATABASE_URL = url.toString();
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: "pipe" });
    db = await import("@/lib/db");
    a = (await db.one<{ id: string }>("insert into users(email) values ($1) returning id", [`aa-${randomUUID()}@t.test`]))!.id;
    b = (await db.one<{ id: string }>("insert into users(email) values ($1) returning id", [`ab-${randomUUID()}@t.test`]))!.id;
  });

  it("the handoff page carries a one-time link good for 2 minutes, for that e-mail only", async () => {
    const { appHandoff } = await import("@/lib/app-login");
    const res = await appHandoff("Me@T.Test", "ko", "Asia/Seoul", "abcdefghijklmnop1234");
    const html = await res.text();
    const t = decodeURIComponent(/login\?t=([^&#"]+)/.exec(html)![1]!);
    expect(html).toContain("package=ai.unchore.app");
    expect(html).toContain("&amp;n=abcdefghijklmnop1234#Intent");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const row = await db.one<{ email: string; lang: string; tz: string; secs: number }>(
      "select email, lang, tz, extract(epoch from expires_at - now())::int as secs from login_tokens where token_hash = $1 and used_at is null",
      [createHash("sha256").update(t).digest("hex")]);
    expect(row).toMatchObject({ email: "me@t.test", lang: "ko", tz: "Asia/Seoul" });
    expect(row!.secs).toBeGreaterThan(100);
    expect(row!.secs).toBeLessThanOrEqual(120);
  });

  it("notices are kept only for members who have the app", async () => {
    const { pushUser } = await import("@/lib/push");
    await db.q("insert into app_devices(user_id, device) values ($1, 'phone1')", [a]);
    delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY;
    expect(await pushUser(a, { title: "⏰ Bitcoin", body: "x".repeat(300), url: "/app?c=1", tag: "unchore-rem-1" })).toBe(1);
    expect(await pushUser(b, { title: "⏰ Bitcoin", body: "y", url: "/app" })).toBe(0);
    const rows = await db.q<{ user_id: string; body: string; tag: string }>("select user_id, body, tag from app_inbox");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ user_id: a, tag: "unchore-rem-1" });
    expect(rows[0]!.body).toHaveLength(160);
    // a phone not seen for over 30 days no longer collects
    await db.q("update app_devices set last_seen = now() - interval '31 days' where user_id = $1", [a]);
    expect(await pushUser(a, { title: "t", body: "b", url: "/app" })).toBe(0);
  });
});

// Back on the "server unreachable" cover or the start page must not drop the app at once (owner 2026-10-01 — back closed the app, so it was uninstalled).
describe("back button keeps the app open", () => {
  it("only two presses within 2 s (or a failed floating window) send the app back", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("android/unchore-app/src/ai/unchore/app/MainActivity.java", "utf8");
    const i = src.indexOf("public void onBackPressed()");
    const back = src.slice(i, src.indexOf("\n    }\n", i));
    const direct = back.split("\n").filter((l) => l.includes("moveTaskToBack(true)"));
    expect(direct.every((l) => l.includes("enterPictureInPictureMode"))).toBe(true);
    expect(back.match(/backTwice\(/g)?.length).toBe(2);
    for (const f of ["values", "values-ko"]) {
      const x = readFileSync(`android/unchore-app/res/${f}/strings.xml`, "utf8");
      expect(x).toMatch(/name="back_reopening"/);
      expect(x).toMatch(/name="back_again"/);
    }
  });
});
