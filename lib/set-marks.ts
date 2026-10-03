import type { Lang } from "./i18n";
import { trFor } from "@/lib/i18n-server";
import { LANG_CODES, k, langInfo, matchLang } from "@/lib/i18n";
// Settings by asking in the chat (owner 2026-09-30). The AI writes «<<<set key=value>>>»; this applies it for the signed-in member
// only, checks every value, and returns the lines shown under the answer. Keys and passwords never go through here — the chat screen
// catches pasted keys, and saved logins go through a box straight to the vault (lib/chat-setup.ts).
import { validTz } from "./tz";
import { MODELS, PROVIDERS, type Provider } from "./ai";
import { one, q } from "./db";
import { creditReady } from "./credits";
import { keepRules } from "./rules-history";
import { subCall } from "./claude-sub";
import { LEVELS } from "./nudge";
import { onOff, type SetMark } from "./chat-setup";

type Now = { name: string | null; lang: string; tz: string; default_model: string | null; notify_email: boolean; memory_on: boolean; web_search: boolean; improve: boolean; theme: string; instructions: string; nudge_level: number; nudge_at: string };

/** What the AI needs to know to answer «what's my setting?» and to change it. */
export async function settingsGuide(userId: string): Promise<string> {
  const u = await one<Now>("select name, lang, tz, default_model, notify_email, memory_on, web_search, improve, theme, instructions, nudge_level, nudge_at from users where id = $1", [userId]);
  const keys = await q<{ provider: Provider }>("select provider from user_keys where user_id = $1", [userId]);
  const vault = await q<{ name: string }>("select name from vault where user_id = $1 order by name", [userId]);
  if (!u) return "";
  const credit = await creditReady(userId);
  const models = [...keys.map((k) => k.provider), ...(credit ? ["credit" as const] : [])].flatMap((p) => MODELS[p] ?? []).map((m) => m.id);
  const onoff = (b: boolean) => (b ? "on" : "off");
  return [
    "## Settings — they change these by asking you, never by visiting Settings",
    `Now: name=${u.name ?? "(none)"} · lang=${u.lang} · tz=${u.tz} · model=${u.default_model ?? "default"} · memory=${onoff(u.memory_on)} · web=${onoff(u.web_search)} · email=${onoff(u.notify_email)} · improve=${onoff(u.improve)} · theme=${u.theme}`,
    `Daily note: ${LEVELS[u.nudge_level] ?? "daily"} at ${u.nudge_at} · Connected AI: ${keys.map((k) => k.provider).join(", ") || "none"}${credit ? " (+ Unchore credit)" : ""} · Saved logins: ${vault.map((v) => v.name).join(", ") || "none"}`,
    `My instructions: ${u.instructions ? u.instructions.replace(/\s+/g, " ").slice(0, 400) : "(none)"}`,
    "When they ask to change one, answer in one short natural line in their words (e.g. «네, 어둡게 바꿀게요.» / «Sure, switching to dark.») and put the mark on the last line. Never mention marks, «the app» or «requests» — the confirmation appears under your answer by itself:",
    `<<<set lang=${LANG_CODES.join("|")}>>> · ` + "<<<set theme=auto|light|dark|night>>> · <<<set tz=America/New_York>>> (IANA name) · <<<set name=…>>>",
    `<<<set model=ID|auto|default>>> — IDs they can use: ${models.join(", ") || "(none yet)"}`,
    "<<<set memory=on|off>>> remember things about them · <<<set web=on|off>>> web search · <<<set email=on|off>>> e-mail automation results · <<<set improve=on|off>>> share de-identified chats to improve Unchore",
    `<<<set rules+=…>>> add one standing instruction · <<<set rules=clear>>> remove all · <<<set disconnect=${PROVIDERS.join("|")}>>> unplug an AI (only if they clearly asked)`,
    "Picking an AI: they may say it in any words («use Gemini from now on», «the cheapest one», «switch to GPT») — pick the matching ID above. Cheapest first: DeepSeek, Gemini Flash, Kimi, then the rest; a plan they pay for (Claude plan, ChatGPT plan) costs nothing extra. If they name an AI that isn't connected, say which one isn't and that pasting its API key here connects it.",
    "Saved login for an automation (a site password): you MUST end your answer with the line <<<secret name=short-name>>> (e.g. <<<secret name=airline-login>>>) — without that exact line no box appears. Tell them to type it in the box below your answer. NEVER ask them to type a password or key in the chat. If they already pasted one, tell them it wasn't sent to the AI.",
    `A new AI key: tell them to paste it in the chat box — the app saves it without sending it to you. To connect or reconnect their Claude plan, tell them to type «${trFor(u.lang)("connect Claude")}» (or «connect Claude»); their ChatGPT plan: «${trFor(u.lang)("connect ChatGPT")}» — the app shows the steps. Keys work for Claude, ChatGPT, OpenRouter, Gemini, Grok, DeepSeek and Kimi.`,
    "Export and import are on [Settings › Files](/app/settings?tab=files); deleting the account is on [Settings › Devices & security](/app/settings?tab=device) — give that link.",
    "Where things are — when they ask where or how to do one of these themselves (and it isn't a setting above you can just change), answer in a line or two with the link; the app shows it as a «Go to» button under your answer. Link text in their language: [AI connections](/app/settings?tab=ai) (Claude/ChatGPT plan, AI keys, credits) · [Google](/app/settings?tab=ai#google) · [Telegram](/app/settings?tab=ai#telegram) · [Computers](/app/settings?tab=ai#computers) · [Security check](/app/settings?tab=ai#security-check) · [Automations](/app/automations) (reminders, schedules, watches — pause or delete) · [Memory & rules](/app/settings?tab=memory) · [My notes](/app/settings?tab=memory#my-notes) · [My files](/app/settings?tab=files#my-files) · [Notifications & daily note](/app/settings?tab=screen#notifications) · [Devices & security](/app/settings?tab=device) · [How-to videos](/app/help) (short videos showing how to use Unchore).",
    "Only change what they asked for (a clear «yes» to your own suggestion counts). Several marks are fine.",
  ].join("\n");
}

/** Setting names as a person reads them (translation keys). */
const NAME: Record<string, string> = { lang: k("Language"), theme: k("Brightness"), tz: k("Time zone"), model: k("Default AI"), memory: k("Memory#setting"), web: k("Web search"), email: k("Automation e-mails"), improve: k("Help improve Unchore"), name: k("Name") };
/** How a value reads to a person («dark» → «어둡게»); a language shows in its own name («日本語»). */
const SHOW: Record<string, string> = { dark: k("dark"), light: k("light"), auto: k("match device"), night: k("night") };
const COL: Record<string, string> = { lang: "lang", theme: "theme", tz: "tz", model: "default_model", memory: "memory_on", web: "web_search", email: "notify_email", improve: "improve", name: "name" };

export type Applied = { notes: string[]; changed: Record<string, string> };

/** Apply the marks; bad values are refused with a line, not silently ignored. */
export async function applySetMarks(userId: string, marks: SetMark[], lang: Lang): Promise<Applied> {
  const t = trFor(lang);
  const notes: string[] = [];
  const changed: Record<string, string> = {};
  const say = (k: string, v: string) => notes.push(`⚙ ${NAME[k] ? t(NAME[k]) : k}: ${v}`);
  const refuse = (k: string, v: string) => notes.push(t("⚠ Couldn't set {name} to «{value}».", { name: NAME[k] ? t(NAME[k]) : k, value: v }));
  for (const { key, value } of marks.slice(0, 8)) {
    if (key === "rules+") {
      const line = value.replace(/\s+/g, " ").trim().slice(0, 300);
      if (!line) continue;
      await keepRules(userId, null);
      await q("update users set instructions = trim(both E'\\n' from coalesce(instructions, '') || E'\\n' || $2) where id = $1", [userId, line]);
      notes.push(t("📌 Added to your instructions: {line}", { line }));
      continue;
    }
    if (key === "rules") {
      if (value !== "clear") { refuse(key, value); continue; }
      await keepRules(userId, "");
      await q("update users set instructions = '' where id = $1", [userId]);
      notes.push(t("📌 Cleared your instructions."));
      continue;
    }
    if (key === "disconnect") {
      if (!(PROVIDERS as string[]).includes(value)) { refuse(key, value); continue; }
      if (value === "claude_sub") await subCall("logout", { user: userId }, 40_000).catch(() => null);
      if (value === "chatgpt_sub") await subCall("logout", { user: userId }, 40_000, "chatgpt").catch(() => null);
      await q("delete from user_keys where user_id = $1 and provider = $2", [userId, value]);
      changed.keys = "1";
      notes.push(t("🔌 Disconnected {what}.", { what: value === "claude_sub" ? t("Claude plan") : value === "chatgpt_sub" ? t("ChatGPT plan") : value }));
      continue;
    }
    let v: string | boolean | null = null;
    if (key === "lang") v = matchLang(value);
    else if (key === "theme") v = ["auto", "light", "dark", "night"].includes(value) ? value : null;
    else if (key === "tz") v = validTz(value);
    else if (key === "name") v = value.replace(/[<>]/g, "").slice(0, 80) || null;
    else if (key === "model") {
      if (value === "default") v = "";
      else if (value === "auto") v = "auto";
      else {
        const keys = await q<{ provider: Provider }>("select provider from user_keys where user_id = $1", [userId]);
        const mine = [...keys.map((k) => k.provider), ...(await creditReady(userId) ? ["credit" as const] : [])];
        v = mine.some((p) => (MODELS[p] ?? []).some((m) => m.id === value)) ? value : null;
      }
    } else v = onOff(value);
    if (v === null) { refuse(key, value); continue; }
    await q(`update users set ${COL[key]} = $2 where id = $1`, [userId, key === "model" && v === "" ? null : v]);
    changed[key] = String(v);
    say(key, typeof v === "boolean" ? t(v ? "on" : "off") : v === "" ? t("default") : v === "auto" && key === "model" ? t("auto-pick") : key === "lang" ? langInfo(v).name : key === "theme" && SHOW[v] ? t(SHOW[v]!) : v);
  }
  return { notes, changed };
}
