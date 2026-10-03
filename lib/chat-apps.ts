// Slack and Discord (owner 2026-10-02 «Unchore has to do what Claude Code, Codex and Hermes do» — Hermes Agent's chat gateway).
// Each member uses their OWN app there (the BYOK way: their workspace, their server, nothing on Unchore's account):
//  · Slack — one link opens Slack's «create app» page with everything filled in (a manifest); they install it and paste two
//    values back. DM the app or @mention it; the answer comes in the same place.
//  · Discord — they make an application in Discord's developer page and paste three values; Unchore points it here and adds
//    a /ask command they can use anywhere (only they see the answer).
// Only one Slack or Discord person may talk to it: the member, proven once by sending the pairing code shown in Settings.
// Each place keeps one Unchore chat, like Telegram (lib/telegram.ts). Values are locked (chat_apps, 038 — fenced per member).
import { createHmac, createPublicKey, randomBytes, timingSafeEqual, verify } from "node:crypto";
import { asMember, one, q } from "./db";
import { lock, unlock } from "./privacy";
import { tr } from "./i18n-server";
import { splitForTelegram } from "./telegram";

export type Kind = "slack" | "discord";
type SlackSecrets = { token: string; signing: string; bot?: string; team?: string };
type DiscordSecrets = { token: string; publicKey: string; appId: string };
type Row = { id: string; user_id: string; kind: Kind; secrets: string | null; app_ref: string | null; owner_ref: string | null; pair_code: string | null; conversation_id: string | null };

const newCode = () => `uc-${randomBytes(4).toString("hex")}`;
const secretsOf = <T>(r: Row): T | null => (r.secrets ? JSON.parse(unlock(r.secrets)) as T : null);

export async function status(userId: string): Promise<Record<Kind, { ready: boolean; paired: boolean; code: string | null; url: string }>> {
  const rows = await q<Row>("select * from chat_apps where user_id = $1", [userId]);
  const base = (process.env.APP_URL ?? "https://unchore.ai").replace(/\/$/, "");
  const one_ = (k: Kind) => { const r = rows.find((x) => x.kind === k); return { ready: !!r?.secrets, paired: !!r?.owner_ref, code: r?.owner_ref ? null : r?.pair_code ?? null, url: r ? `${base}/api/${k}/${r.id}` : "" }; };
  return { slack: one_("slack"), discord: one_("discord") };
}

async function rowFor(userId: string, kind: Kind): Promise<Row> {
  return (await one<Row>(`insert into chat_apps(user_id, kind, pair_code) values ($1, $2, $3)
    on conflict (user_id, kind) do update set pair_code = coalesce(chat_apps.pair_code, excluded.pair_code) returning *`, [userId, kind, newCode()]))!;
}

export async function disconnect(userId: string, kind: Kind): Promise<void> {
  await q("delete from chat_apps where user_id = $1 and kind = $2", [userId, kind]);
}

// ── Slack ──
/** The «create app» link: Slack's own page with the name, permissions and this member's event address filled in. */
export async function slackStart(userId: string, base: string): Promise<string> {
  const r = await rowFor(userId, "slack");
  const manifest = {
    display_information: { name: "Unchore", description: "Your Unchore, in Slack", background_color: "#111111" },
    features: { bot_user: { display_name: "Unchore", always_online: true }, app_home: { messages_tab_enabled: true, messages_tab_read_only_enabled: false } },
    oauth_config: { scopes: { bot: ["app_mentions:read", "chat:write", "im:history", "im:read", "im:write"] } },
    settings: { event_subscriptions: { request_url: `${base}/api/slack/${r.id}`, bot_events: ["app_mention", "message.im"] }, org_deploy_enabled: false, socket_mode_enabled: false, token_rotation_enabled: false },
  };
  return `https://api.slack.com/apps?new_app=1&manifest_json=${encodeURIComponent(JSON.stringify(manifest))}`;
}

type Fetcher = typeof fetch;
async function slackApi(token: string, method: string, body: Record<string, unknown>, f: Fetcher = fetch): Promise<Record<string, unknown>> {
  const r = await f(`https://slack.com/api/${method}`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=utf-8" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
  return (await r.json().catch(() => ({ ok: false }))) as Record<string, unknown>;
}

export async function slackSave(userId: string, token: string, signing: string, f: Fetcher = fetch): Promise<{ ok: boolean; text: string }> {
  if (!/^xoxb-[\w-]{20,}$/.test(token.trim())) return { ok: false, text: "That isn't a bot token — it starts with xoxb- (Slack → your app → OAuth & Permissions → Bot User OAuth Token)." };
  if (!/^[0-9a-f]{32}$/.test(signing.trim())) return { ok: false, text: "That isn't a signing secret — 32 letters and numbers (Slack → your app → Basic Information → Signing Secret)." };
  const me = await slackApi(token.trim(), "auth.test", {}, f);
  if (me.ok !== true) return { ok: false, text: `Slack didn't accept the token (${String(me.error ?? "error")}). Install the app to your workspace first, then copy the token again.` };
  const r = await rowFor(userId, "slack");
  const s: SlackSecrets = { token: token.trim(), signing: signing.trim(), bot: String(me.user_id ?? ""), team: String(me.team ?? "") };
  await q("update chat_apps set secrets = $2, app_ref = $3 where id = $1", [r.id, lock(JSON.stringify(s)), String(me.team_id ?? "")]);
  return { ok: true, text: String(me.team ?? "") };
}

/** Slack signs every event with the app's signing secret: v0=HMAC(«v0:<time>:<body>»). Older than 5 minutes → refused. */
export function slackSigned(signing: string, ts: string | null, sig: string | null, body: string, now = Date.now()): boolean {
  if (!ts || !sig || !/^\d+$/.test(ts) || Math.abs(now / 1000 - Number(ts)) > 300) return false;
  const want = `v0=${createHmac("sha256", signing).update(`v0:${ts}:${body}`).digest("hex")}`;
  return want.length === sig.length && timingSafeEqual(Buffer.from(want), Buffer.from(sig));
}

type SlackEvent = { type?: string; user?: string; bot_id?: string; subtype?: string; text?: string; channel?: string; channel_type?: string; ts?: string; thread_ts?: string };
/** One Slack request to /api/slack/<id>. Returns what to answer Slack now, and work to do after (the answer itself). */
export async function slackIncoming(id: string, headers: Headers, body: string, f: Fetcher = fetch): Promise<{ status: number; json: unknown; after?: () => Promise<void> }> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { status: 404, json: {} };
  const r = await one<Row>("select * from chat_apps where id = $1 and kind = 'slack'", [id]);
  if (!r) return { status: 404, json: {} };
  let m: { type?: string; challenge?: string; event?: SlackEvent } = {};
  try { m = JSON.parse(body); } catch { return { status: 400, json: {} }; }
  const s = secretsOf<SlackSecrets>(r);
  // Slack checks the address once when the app is made — before the member has pasted the signing secret.
  if (m.type === "url_verification" && typeof m.challenge === "string" && !s) return { status: 200, json: { challenge: m.challenge } };
  if (!s || !slackSigned(s.signing, headers.get("x-slack-request-timestamp"), headers.get("x-slack-signature"), body)) return { status: 401, json: {} };
  if (m.type === "url_verification") return { status: 200, json: { challenge: m.challenge } };
  if (headers.get("x-slack-retry-num")) return { status: 200, json: {} };   // Slack resends when we're slow — the first one is already being answered
  const e = m.event ?? {};
  const isDm = e.type === "message" && e.channel_type === "im" && !e.subtype && !e.bot_id;
  if (!(isDm || e.type === "app_mention") || !e.user || e.user === s.bot || !e.channel) return { status: 200, json: {} };
  const text = (e.text ?? "").replace(/<@[A-Z0-9]+>/g, "").trim();
  const say = (t: string) => slackApi(s.token, "chat.postMessage", { channel: e.channel, text: t, ...(isDm ? {} : { thread_ts: e.thread_ts ?? e.ts }) }, f).then(() => undefined);
  return { status: 200, json: {}, after: () => answerFrom(r, e.user!, text, say) };
}

// ── Discord ──
const SPKI_ED25519 = Buffer.from("302a300506032b6570032100", "hex");
export function discordSigned(publicKey: string, ts: string | null, sig: string | null, body: string): boolean {
  if (!ts || !sig || !/^[0-9a-f]{128}$/i.test(sig) || !/^[0-9a-f]{64}$/i.test(publicKey)) return false;
  try {
    const key = createPublicKey({ key: Buffer.concat([SPKI_ED25519, Buffer.from(publicKey, "hex")]), format: "der", type: "spki" });
    return verify(null, Buffer.from(ts + body), key, Buffer.from(sig, "hex"));
  } catch { return false; }
}

const DAPI = "https://discord.com/api/v10";
async function discordApi(token: string | null, method: string, path: string, body?: unknown, f: Fetcher = fetch): Promise<{ status: number; json: Record<string, unknown> | null }> {
  const r = await f(`${DAPI}${path}`, { method, headers: { ...(token ? { authorization: `Bot ${token}` } : {}), "content-type": "application/json", "user-agent": "Unchore (https://unchore.ai, 1)" }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
  return { status: r.status, json: (await r.json().catch(() => null)) as Record<string, unknown> | null };
}

/** Saves their application's values, points its «Interactions Endpoint» here, adds /ask, and gives the one-tap install link. */
export async function discordSave(userId: string, a: { appId: string; publicKey: string; token: string }, base: string, f: Fetcher = fetch): Promise<{ ok: boolean; text: string; install?: string }> {
  const appId = a.appId.trim(), publicKey = a.publicKey.trim().toLowerCase(), token = a.token.trim();
  if (!/^\d{15,22}$/.test(appId)) return { ok: false, text: "That isn't an Application ID — numbers only (Discord developer page → your app → General Information)." };
  if (!/^[0-9a-f]{64}$/.test(publicKey)) return { ok: false, text: "That isn't a Public Key — 64 letters and numbers (same page, under Application ID)." };
  if (token.length < 50) return { ok: false, text: "That isn't a bot token (your app → Bot → Reset Token → copy)." };
  const me = await discordApi(token, "GET", "/applications/@me", undefined, f);
  if (me.status !== 200 || String(me.json?.id ?? "") !== appId) return { ok: false, text: "Discord didn't accept the bot token for this Application ID — copy both again from the same app." };
  const r = await rowFor(userId, "discord");
  const s: DiscordSecrets = { token, publicKey, appId };
  await q("update chat_apps set secrets = $2, app_ref = $3 where id = $1", [r.id, lock(JSON.stringify(s)), appId]);
  // Discord sends a signed check to the address before keeping it — the values above are saved first so it passes.
  const set = await discordApi(token, "PATCH", "/applications/@me", { interactions_endpoint_url: `${base}/api/discord/${r.id}`, integration_types_config: { 0: {}, 1: {} } }, f);
  if (set.status !== 200) return { ok: false, text: `Discord didn't take Unchore's address (${set.status}${set.json?.message ? `: ${String(set.json.message)}` : ""}). Try again in a minute.` };
  const cmd = await discordApi(token, "PUT", `/applications/${appId}/commands`, [{ name: "ask", type: 1, description: "Ask Unchore", integration_types: [0, 1], contexts: [0, 1, 2],
    options: [{ type: 3, name: "question", description: "What to ask", required: true }] }], f);
  if (cmd.status !== 200) return { ok: false, text: `Discord didn't add the /ask command (${cmd.status}).` };
  return { ok: true, text: "", install: `https://discord.com/oauth2/authorize?client_id=${appId}&integration_type=1&scope=applications.commands` };
}

type Interaction = { type: number; token?: string; application_id?: string; data?: { name?: string; options?: Array<{ name: string; value: unknown }> }; member?: { user?: { id?: string } }; user?: { id?: string } };
export async function discordIncoming(id: string, headers: Headers, body: string, f: Fetcher = fetch): Promise<{ status: number; json: unknown; after?: () => Promise<void> }> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { status: 404, json: {} };
  const r = await one<Row>("select * from chat_apps where id = $1 and kind = 'discord'", [id]);
  const s = r ? secretsOf<DiscordSecrets>(r) : null;
  if (!r || !s || !discordSigned(s.publicKey, headers.get("x-signature-timestamp"), headers.get("x-signature-ed25519"), body)) return { status: 401, json: { error: "bad signature" } };
  let i: Interaction;
  try { i = JSON.parse(body); } catch { return { status: 400, json: {} }; }
  if (i.type === 1) return { status: 200, json: { type: 1 } };   // Discord's address check
  if (i.type !== 2 || i.data?.name !== "ask" || !i.token) return { status: 200, json: { type: 4, data: { content: "?", flags: 64 } } };
  const who = i.member?.user?.id ?? i.user?.id ?? "";
  const text = String(i.data.options?.find((o) => o.name === "question")?.value ?? "").trim();
  const hook = `/webhooks/${s.appId}/${i.token}`;
  const say = async (t: string) => {
    const parts = splitForTelegram(t, 1900);
    await discordApi(null, "PATCH", `${hook}/messages/@original`, { content: parts[0] ?? "…" }, f);
    for (const p of parts.slice(1)) await discordApi(null, "POST", hook, { content: p, flags: 64 }, f);
  };
  // Answer within 3 seconds that the answer is coming (only they see it), then write it.
  return { status: 200, json: { type: 5, data: { flags: 64 } }, after: () => answerFrom(r, who, text, say) };
}

// ── Both: who may talk, and the answer ──
/** Pairing first (the code from Settings, sent once), then only that person's messages become chat turns. */
async function answerFrom(r: Row, who: string, text: string, say: (t: string) => Promise<void>): Promise<void> {
  const owner = await one<{ id: string; lang: string; tz: string; default_model: string | null }>("select id, lang, tz, default_model from users where id = $1", [r.user_id]);
  if (!owner || !who) return;
  if (!r.owner_ref) {
    if (r.pair_code && text.toLowerCase().includes(r.pair_code)) {
      const claimed = await one("update chat_apps set owner_ref = $2, pair_code = null where id = $1 and owner_ref is null returning 1", [r.id, who]);
      await say(claimed ? tr(owner.lang, "Connected. Write here and Unchore answers.") : tr(owner.lang, "This Unchore is already connected to someone."));
    } else await say(tr(owner.lang, "Send the pairing code from Unchore → Settings first."));
    return;
  }
  if (r.owner_ref !== who) { await say(tr(owner.lang, "This Unchore answers only the person who connected it.")); return; }
  if (!text) return;
  try {
    const { runTurn, TurnError } = await import("./turn");
    const answer = await asMember(owner.id, async () => {
      const conv = r.conversation_id && await one("select 1 from conversations where id = $1", [r.conversation_id]) ? r.conversation_id : null;
      let meta;
      try { meta = await runTurn(owner, { conversationId: conv, text }); }
      catch (e) { if (e instanceof TurnError && e.code === "no_key") return tr(owner.lang, "Connect your AI first in Unchore → Settings, then write here again."); throw e; }
      if (meta.conversationId !== conv) await q("update chat_apps set conversation_id = $1 where id = $2", [meta.conversationId, r.id]);
      if (meta.text) return meta.text;
      const m = await one<{ content: string }>("select content from messages where id = $1", [meta.messageId]);
      return unlock(m?.content) || "…";
    });
    await say(answer);
  } catch (e) {
    console.warn(`${r.kind} turn failed: ${(e as Error).message}`);
    await say(tr(owner.lang, "Something went wrong. Please try again in a moment."));
  }
}
