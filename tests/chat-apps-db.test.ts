// Slack and Discord on the member's own app (lib/chat-apps.ts). Fake Slack and Discord, a fake chat turn, a real Postgres:
// signatures are checked (Slack's HMAC, Discord's Ed25519), Slack's first address check passes before the secret is pasted,
// only the person who sent the pairing code is answered, the answer goes back to the same place, Slack's resends are ignored,
// and another member's settings show none of it. Skipped without TEST_DATABASE_URL.
import { execFileSync } from "node:child_process";
import { createHmac, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import pg from "pg";
import { beforeAll, describe, expect, it, vi } from "vitest";

const said = vi.hoisted(() => ({ turns: [] as string[], conv: null as string | null }));
vi.mock("@/lib/turn", () => ({
  TurnError: class extends Error {},
  runTurn: async (_u: unknown, d: { conversationId: string | null; text: string }) => { said.turns.push(d.text); return { conversationId: d.conversationId ?? said.conv, messageId: "m", text: `answer to ${d.text}` }; },
}));
const URL_DB = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL_DB)("Slack and Discord on the member's own app (database)", () => {
  let db: typeof import("@/lib/db");
  let ca: typeof import("@/lib/chat-apps");
  let a = "", b = "";
  const calls: Array<{ url: string; method: string; body: Record<string, unknown> | unknown[] | null; auth: string }> = [];
  const fake = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input), body = init.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, method: init.method ?? "GET", body, auth: String((init.headers as Record<string, string>)?.authorization ?? "") });
    const j = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
    if (url.endsWith("/auth.test")) return j({ ok: true, user_id: "UBOT", team: "Acme", team_id: "T1" });
    if (url.endsWith("/chat.postMessage")) return j({ ok: true });
    if (url.endsWith("/applications/@me") && init.method === "GET") return j({ id: "123456789012345678" });
    return j({});
  }) as typeof fetch;

  beforeAll(async () => {
    const name = `uc_ca_${randomUUID().slice(0, 8)}`;
    const admin = new pg.Client({ connectionString: URL_DB }); await admin.connect();
    await admin.query(`create database ${name}`);
    await admin.query("do $$ begin create role unchore_member nologin; exception when duplicate_object or unique_violation then null; end $$");
    await admin.end();
    const url = new globalThis.URL(URL_DB!); url.pathname = `/${name}`;
    process.env.DATABASE_URL = url.toString();
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: "pipe" });
    db = await import("@/lib/db");
    ca = await import("@/lib/chat-apps");
    a = (await db.one<{ id: string }>("insert into users(email, tz, lang) values ($1, 'UTC', 'en') returning id", [`a-${randomUUID()}@t.test`]))!.id;
    b = (await db.one<{ id: string }>("insert into users(email, tz) values ($1, 'UTC') returning id", [`b-${randomUUID()}@t.test`]))!.id;
  }, 30_000);

  const SIGNING = "0123456789abcdef0123456789abcdef";
  const slackReq = (body: object, o: { ts?: number; secret?: string; retry?: boolean } = {}) => {
    const raw = JSON.stringify(body), ts = String(Math.floor((o.ts ?? Date.now()) / 1000));
    const sig = `v0=${createHmac("sha256", o.secret ?? SIGNING).update(`v0:${ts}:${raw}`).digest("hex")}`;
    return { raw, headers: new Headers({ "x-slack-request-timestamp": ts, "x-slack-signature": sig, ...(o.retry ? { "x-slack-retry-num": "1" } : {}) }) };
  };

  it("Slack: the create link carries this member's address; the first check passes; then signed events only", async () => {
    const link = new URL(await db.asMember(a, () => ca.slackStart(a, "https://unchore.ai")));
    const m = JSON.parse(link.searchParams.get("manifest_json")!);
    const st = await db.asMember(a, () => ca.status(a));
    expect(m.settings.event_subscriptions.request_url).toBe(st.slack.url);
    const id = st.slack.url.split("/").pop()!;
    // Slack's address check when the app is made — no secret pasted yet
    expect(await ca.slackIncoming(id, new Headers(), JSON.stringify({ type: "url_verification", challenge: "abc" }), fake)).toMatchObject({ status: 200, json: { challenge: "abc" } });
    expect((await db.asMember(a, () => ca.slackSave(a, "nope", SIGNING, fake))).ok).toBe(false);
    expect((await db.asMember(a, () => ca.slackSave(a, "xoxb-1111111111-2222222222-abcdefghijkl", SIGNING, fake))).ok).toBe(true);
    const raw = await db.one<{ secrets: string }>("select secrets from chat_apps where id = $1", [id]);
    expect(raw!.secrets.startsWith("enc:")).toBe(true);
    // now unsigned or wrongly signed → refused; old → refused
    expect((await ca.slackIncoming(id, new Headers(), JSON.stringify({ type: "url_verification", challenge: "x" }), fake)).status).toBe(401);
    const bad = slackReq({ type: "event_callback", event: {} }, { secret: "f".repeat(32) });
    expect((await ca.slackIncoming(id, bad.headers, bad.raw, fake)).status).toBe(401);
    const old = slackReq({ type: "event_callback", event: {} }, { ts: Date.now() - 10 * 60_000 });
    expect((await ca.slackIncoming(id, old.headers, old.raw, fake)).status).toBe(401);
  });

  it("Slack: pairing code first, then only that person is answered, in the same place; resends ignored", async () => {
    const st = await db.asMember(a, () => ca.status(a));
    const id = st.slack.url.split("/").pop()!, code = st.slack.code!;
    const dm = (user: string, text: string, retry = false) => { const r = slackReq({ type: "event_callback", event: { type: "message", channel_type: "im", user, text, channel: "D1", ts: "1.1" } }, { retry }); return ca.slackIncoming(id, r.headers, r.raw, fake); };
    calls.length = 0;
    let r = await dm("U_ME", "hello"); await r.after?.();
    expect(calls.at(-1)!.body).toMatchObject({ channel: "D1", text: "Send the pairing code from Unchore → Settings first." });
    r = await dm("U_ME", `here: ${code}`); await r.after?.();
    expect(calls.at(-1)!.body).toMatchObject({ text: "Connected. Write here and Unchore answers." });
    r = await dm("U_OTHER", "what's in her notes?"); await r.after?.();
    expect(calls.at(-1)!.body).toMatchObject({ text: "This Unchore answers only the person who connected it." });
    said.turns.length = 0;
    r = await dm("U_ME", "plan my week"); await r.after?.();
    expect(said.turns).toEqual(["plan my week"]);
    expect(calls.at(-1)!.body).toMatchObject({ channel: "D1", text: "answer to plan my week" });
    expect(calls.at(-1)!.auth).toBe("Bearer xoxb-1111111111-2222222222-abcdefghijkl");
    // @mention in a channel → answered in a thread under it, the mention taken out
    const men = slackReq({ type: "event_callback", event: { type: "app_mention", user: "U_ME", text: "<@UBOT> summarize", channel: "C9", ts: "5.5" } });
    r = await ca.slackIncoming(id, men.headers, men.raw, fake); await r.after?.();
    expect(calls.at(-1)!.body).toMatchObject({ channel: "C9", thread_ts: "5.5", text: "answer to summarize" });
    // the app's own messages and Slack's resends start nothing
    const n = said.turns.length;
    await (await dm("UBOT", "loop")).after?.();
    expect((await dm("U_ME", "again", true)).after).toBeUndefined();
    expect(said.turns.length).toBe(n);
  });

  it("Discord: values checked, address and /ask set, signed requests only, pairing, only the owner, answer replaces «coming»", async () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const pub = (publicKey.export({ format: "der", type: "spki" }) as Buffer).subarray(12).toString("hex");
    const appId = "123456789012345678";
    expect((await db.asMember(a, () => ca.discordSave(a, { appId: "x", publicKey: pub, token: "t".repeat(60) }, "https://unchore.ai", fake))).ok).toBe(false);
    calls.length = 0;
    const saved = await db.asMember(a, () => ca.discordSave(a, { appId, publicKey: pub, token: "t".repeat(60) }, "https://unchore.ai", fake));
    expect(saved.ok).toBe(true);
    expect(saved.install).toBe(`https://discord.com/oauth2/authorize?client_id=${appId}&integration_type=1&scope=applications.commands`);
    const st = await db.asMember(a, () => ca.status(a));
    const id = st.discord.url.split("/").pop()!;
    expect(calls.find((c) => c.method === "PATCH")!.body).toMatchObject({ interactions_endpoint_url: `https://unchore.ai/api/discord/${id}` });
    expect((calls.find((c) => c.method === "PUT")!.body as Array<{ name: string }>)[0]!.name).toBe("ask");
    const req = (o: object) => { const raw = JSON.stringify(o), ts = String(Date.now()); const sig = sign(null, Buffer.from(ts + raw), privateKey).toString("hex"); return { raw, headers: new Headers({ "x-signature-timestamp": ts, "x-signature-ed25519": sig }) }; };
    const ping = req({ type: 1 });
    expect(await ca.discordIncoming(id, ping.headers, ping.raw, fake)).toMatchObject({ status: 200, json: { type: 1 } });
    expect((await ca.discordIncoming(id, new Headers({ "x-signature-timestamp": "1", "x-signature-ed25519": "0".repeat(128) }), ping.raw, fake)).status).toBe(401);
    const ask = (user: string, q: string) => { const r = req({ type: 2, token: "itok", application_id: appId, data: { name: "ask", options: [{ name: "question", value: q }] }, user: { id: user } }); return ca.discordIncoming(id, r.headers, r.raw, fake); };
    calls.length = 0;
    let r = await ask("D_ME", st.discord.code!);
    expect(r.json).toEqual({ type: 5, data: { flags: 64 } });
    await r.after?.();
    expect(calls.at(-1)).toMatchObject({ method: "PATCH", url: `https://discord.com/api/v10/webhooks/${appId}/itok/messages/@original`, body: { content: "Connected. Write here and Unchore answers." } });
    r = await ask("D_OTHER", "hi"); await r.after?.();
    expect(calls.at(-1)!.body).toMatchObject({ content: "This Unchore answers only the person who connected it." });
    said.turns.length = 0;
    r = await ask("D_ME", "draft a reply"); await r.after?.();
    expect(said.turns).toEqual(["draft a reply"]);
    expect(calls.at(-1)!.body).toMatchObject({ content: "answer to draft a reply" });
  });

  it("another member sees none of it; disconnect removes it", async () => {
    const st = await db.asMember(b, () => ca.status(b));
    expect(st.slack.ready || st.discord.ready).toBe(false);
    expect(await db.asMember(b, () => db.q("select id from chat_apps"))).toEqual([]);
    await db.asMember(b, () => ca.disconnect(b, "slack"));
    expect((await db.asMember(a, () => ca.status(a))).slack.paired).toBe(true);
    await db.asMember(a, () => ca.disconnect(a, "slack"));
    expect((await db.asMember(a, () => ca.status(a))).slack.ready).toBe(false);
  });
});
