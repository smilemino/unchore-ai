// Talk to Unchore from Telegram (owner 2026-10-01). One official bot (TELEGRAM_BOT_TOKEN_UNCHORE / TELEGRAM_BOT_USERNAME).
// Link: Settings makes a 10-minute code → t.me/<bot>?start=<code> → the webhook (app/api/telegram) ties that chat to the member.
// Then a Telegram message is a normal chat turn in one «Telegram» conversation, and pushUser() also sends notices here.
import { randomBytes } from "node:crypto";
import { asMember, asOwner, one, q } from "./db";
import { tr } from "./i18n-server";

const token = () => process.env.TELEGRAM_BOT_TOKEN_UNCHORE ?? "";
export const botName = () => (process.env.TELEGRAM_BOT_USERNAME ?? "").replace(/^@/, "");
export const telegramOn = () => Boolean(token() && botName());

export async function tgCall(method: string, body: Record<string, unknown>): Promise<boolean> {
  if (!token()) return false;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token()}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
    return r.ok;
  } catch { return false; }
}

/** Telegram allows 4096 characters a message; long answers go in a few parts (at most 4). */
export function splitForTelegram(text: string, max = 4000): string[] {
  const out: string[] = [];
  let rest = text.trim();
  while (rest && out.length < 4) {
    if (rest.length <= max) { out.push(rest); break; }
    let cut = rest.lastIndexOf("\n", max);
    if (cut < max / 2) cut = max;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest && out.length === 4 && out.join("").length < text.trim().length) out[3] = `${out[3]!.slice(0, max - 2)}…`;
  return out;
}

export async function sendText(chatId: number | string, text: string): Promise<boolean> {
  let ok = true;
  for (const part of splitForTelegram(text)) ok = (await tgCall("sendMessage", { chat_id: chatId, text: part, disable_web_page_preview: true })) && ok;
  return ok;
}

/** A fresh one-time code for the signed-in member (older codes of theirs are dropped). */
export async function newLinkCode(userId: string): Promise<{ code: string; url: string }> {
  const code = randomBytes(12).toString("base64url");
  await q("delete from telegram_codes where user_id = $1", [userId]);
  await q("insert into telegram_codes(code, user_id, expires_at) values ($1, $2, now() + interval '10 minutes')", [code, userId]);
  return { code, url: `https://t.me/${botName()}?start=${code}` };
}

export async function linkStatus(userId: string): Promise<{ linked: boolean; conversationId: string | null }> {
  const l = await one<{ conversation_id: string | null }>("select conversation_id from telegram_links where user_id = $1", [userId]);
  return { linked: Boolean(l), conversationId: l?.conversation_id ?? null };
}

/** «Continue in Telegram» from a chat's menu (AI Soul's title menu, lib/tg-handoff.ts): Telegram messages go into this chat from now on.
 *  The member's own chat only; false when it isn't theirs or Telegram isn't linked. A short note in Telegram says which chat it is. */
export async function continueIn(userId: string, convId: string): Promise<boolean> {
  const c = await one<{ title: string }>("select title from conversations where id = $1 and user_id = $2", [convId, userId]);
  if (!c) return false;
  const l = await one<{ chat_id: string }>("update telegram_links set conversation_id = $2 where user_id = $1 returning chat_id::text", [userId, convId]);
  if (!l) return false;
  const o = await one<{ lang: string }>("select lang from users where id = $1", [userId]);
  const { unlock } = await import("./privacy");
  await sendText(l.chat_id, tr(o?.lang ?? "en", "Now continuing «{title}» here. Write here and the answer comes here. Send /new to start a new chat.", { title: unlock(c.title) || "…" }));
  return true;
}

export async function unlink(userId: string): Promise<void> {
  const l = await one<{ chat_id: string }>("select chat_id::text from telegram_links where user_id = $1", [userId]);
  await q("delete from telegram_links where user_id = $1", [userId]);
  if (l) await tgCall("sendMessage", { chat_id: l.chat_id, text: "Unchore ✕" });
}

/** Called by pushUser(): the same notice also goes to the linked Telegram chat. Never throws. */
export async function toTelegram(userId: string, msg: { title: string; body: string }): Promise<number> {
  if (!telegramOn()) return 0;
  try {
    const l = await asOwner(() => one<{ chat_id: string }>("select chat_id::text from telegram_links where user_id = $1", [userId]));
    if (!l) return 0;
    return (await sendText(l.chat_id, `${msg.title}\n${msg.body}`)) ? 1 : 0;
  } catch { return 0; }
}

type Update = { message?: { chat?: { id?: number; type?: string }; text?: string } };
type Owner = { id: string; lang: string; tz: string; default_model: string | null };

/** One incoming Telegram update (owner connection). Private chats only. */
export async function handleUpdate(u: Update): Promise<void> {
  const chatId = u.message?.chat?.id, text = (u.message?.text ?? "").trim();
  if (!chatId || u.message?.chat?.type !== "private" || !text) return;
  const start = /^\/start(?:\s+([A-Za-z0-9_-]{8,64}))?$/.exec(text);
  if (start) {
    const c = start[1] ? await one<{ user_id: string }>("delete from telegram_codes where code = $1 and expires_at > now() returning user_id", [start[1]]) : null;
    if (!c) { await sendText(chatId, "Open Unchore → Settings → Telegram and press «Connect Telegram». · unchore.ai/app/settings"); return; }
    await q("delete from telegram_links where chat_id = $1 or user_id = $2", [chatId, c.user_id]);
    await q("insert into telegram_links(user_id, chat_id) values ($1, $2)", [c.user_id, chatId]);
    const o = await one<{ lang: string }>("select lang from users where id = $1", [c.user_id]);
    await sendText(chatId, tr(o?.lang ?? "en", "Connected. Write here and Unchore answers — your reminders will come here too. To disconnect, send /stop."));
    return;
  }
  const link = await one<{ user_id: string; conversation_id: string | null }>("select user_id, conversation_id from telegram_links where chat_id = $1", [chatId]);
  if (!link) { await sendText(chatId, "Open Unchore → Settings → Telegram and press «Connect Telegram». · unchore.ai/app/settings"); return; }
  const owner = await one<Owner>("select id, lang, tz, default_model from users where id = $1", [link.user_id]);
  if (!owner) return;
  if (text === "/stop") { await q("delete from telegram_links where chat_id = $1", [chatId]); await sendText(chatId, tr(owner.lang, "Disconnected. You can connect again from Settings.")); return; }
  if (text === "/new") { await q("update telegram_links set conversation_id = null where chat_id = $1", [chatId]); await sendText(chatId, tr(owner.lang, "Your next message starts a new chat.")); return; }
  await tgCall("sendChatAction", { chat_id: chatId, action: "typing" });
  const typing = setInterval(() => { void tgCall("sendChatAction", { chat_id: chatId, action: "typing" }); }, 4500);
  try {
    const { runTurn, TurnError } = await import("./turn");
    const answer = await asMember(owner.id, async () => {
      const conv = link.conversation_id && await one("select 1 from conversations where id = $1", [link.conversation_id]) ? link.conversation_id : null;
      let meta;
      try { meta = await runTurn(owner, { conversationId: conv, text }); }
      catch (e) { if (e instanceof TurnError && e.code === "no_key") return tr(owner.lang, "Connect your AI first in Unchore → Settings, then write here again."); throw e; }
      if (meta.conversationId !== conv) await q("update telegram_links set conversation_id = $1 where user_id = $2", [meta.conversationId, owner.id]);
      if (meta.text) return meta.text;
      const m = await one<{ content: string }>("select content from messages where id = $1", [meta.messageId]);
      const { unlock } = await import("./privacy");
      return unlock(m?.content) || "…";
    });
    await sendText(chatId, answer);
  } catch (e) {
    console.warn(`telegram turn failed: ${(e as Error).message}`);
    await sendText(chatId, tr(owner.lang, "Something went wrong. Please try again in a moment."));
  } finally { clearInterval(typing); }
}
