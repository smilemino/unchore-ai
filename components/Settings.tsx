"use client";
import { useEffect, useState } from "react";
import { UndoBar, useDelayedDelete } from "./Undo";
import { LANGS, k, type Lang, type TFn } from "@/lib/i18n";
import { useT } from "./I18n";
import { findNotes } from "@/lib/notes-find";
import type { FileRow } from "@/lib/files-list";
import { DAY_GROUPS, FILE_KINDS, dayGroup, fileKind, humanSize, type FileKind } from "@/lib/file-groups";
import { ONE_ROW_MAX, PART_BYTES } from "@/lib/upload-limits";
import { Credits } from "./Credits";
import { Markdown } from "./Markdown";
import { useClientValue } from "./useClient";
import { allowBoxOpens, enablePush } from "./push-client";
import { ANNOUNCE_KEY, announceOn } from "@/lib/voice/announce";
import { VoicePicker } from "./VoicePicker";
import { modelBlurb } from "@/lib/model-blurb";

type Me = { user: { email: string; name: string | null; lang: string; tz: string; default_model: string | null; notify_email: boolean; instructions?: string; memory_on?: boolean; memory_write?: boolean; web_search?: boolean; claude_connectors?: boolean; improve?: boolean; ask_judge?: boolean; keep_going?: boolean; plain_gate?: boolean; face?: string | null; nudge_level?: number; nudge_at?: string }; keys: { provider: string; hint: string }[]; providers: string[]; models: Record<string, { id: string; label: string }[]> };
type VaultRow = { name: string; hint: string };

const KEY_URL: Record<string, string> = { anthropic: "https://console.anthropic.com/settings/keys", openai: "https://platform.openai.com/api-keys", openrouter: "https://openrouter.ai/keys",
  gemini: "https://aistudio.google.com/apikey", xai: "https://console.x.ai", deepseek: "https://platform.deepseek.com/api_keys", kimi: "https://platform.moonshot.ai/console/api-keys" };
const NAME: Record<string, string> = { anthropic: "Anthropic (Claude)", openai: "OpenAI (GPT)", openrouter: "OpenRouter", gemini: "Google (Gemini)", xai: "xAI (Grok)", deepseek: "DeepSeek", kimi: "Moonshot (Kimi)" };
/** Signed-in plans have their own rows; every other provider is an API key. */
const isPlan = (p: string) => p.endsWith("_sub");

// «device» keeps its id (old links) and is now «Devices & security»; «files» and «screen» were split out of it and «Memory»
// (owner 2026-10-03, with AI Soul: one job per tab, a line on top saying what the tab is for).
export type Tab = "status" | "ai" | "memory" | "files" | "screen" | "device";
/** Old links pointed at a part that now lives in another tab (#notifications, #my-files) — open the tab that has it. */
export const TAB_OF_PART: Record<string, Tab> = { notifications: "screen", "my-files": "files" };

export function Settings({ lang, initialTab = "status" }: { lang: Lang; initialTab?: Tab }) {
  const t = useT();
  const [me, setMe] = useState<Me | null>(null);
  const [vault, setVault] = useState<VaultRow[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [plan, setPlan] = useState<{ url?: string; code: string; msg?: string }>({ code: "" });
  const [vName, setVName] = useState("");
  const [vVal, setVVal] = useState("");
  const [announce, setAnnounce] = useState(() => typeof localStorage === "undefined" || announceOn(localStorage.getItem(ANNOUNCE_KEY)));
  const [theme, setTheme] = useState(() => (typeof localStorage !== "undefined" && localStorage.getItem("uc_theme")) || "auto");
  const [rules, setRules] = useState<string | null>(null);
  const [rulesMsg, setRulesMsg] = useState("");
  const [rulesRev, setRulesRev] = useState(0);
  const [mems, setMems] = useState<{ id: string; text: string }[]>([]);
  const [newMem, setNewMem] = useState("");
  const [tab, setTab] = useState<Tab>(initialTab);
  const [autos, setAutos] = useState<{ status: string }[]>([]);
  const loadMems = () => fetch("/api/memories").then((r) => r.json()).then(setMems).catch(() => {});
  const memRemoval = useDelayedDelete(() => { void loadMems(); });   // «Memory deleted · Undo» for 5 s instead of deleting at once
  const memShown = mems.filter((m) => memRemoval.undo?.url !== `/api/memories/${m.id}`);
  const load = () => { fetch("/api/me").then((r) => r.json()).then(setMe); fetch("/api/vault").then((r) => r.json()).then(setVault); };
  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then(setMe);
    fetch("/api/vault").then((r) => r.json()).then(setVault);
    loadMems();
    fetch("/api/automations").then((r) => (r.ok ? r.json() : [])).then(setAutos).catch(() => {});
  }, []);
  // «Go to» buttons under a chat answer open /app/settings?tab=…#telegram — scroll to that part once the page has drawn
  // (#security-check scrolls itself in Credits, after its own data loads).
  const ready = !!me;
  useEffect(() => {
    const id = ready ? window.location.hash.slice(1) : "";
    if (!id || id === "security-check") return;
    // a part that moved to another tab (old links): open that tab first, then scroll once it is drawn
    requestAnimationFrame(() => { const to = TAB_OF_PART[id]; if (to) setTab(to); requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" })); });
  }, [ready]);
  if (!me) return <div className="p-6 text-muted">…</div>;
  const u = me.user;
  async function saveKey(p: string) {
    setMsg((m) => ({ ...m, [p]: t("Checking…") }));
    const r = await fetch("/api/settings/keys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: p, key: draft[p] ?? "" }) });
    const j = await r.json().catch(() => ({}));
    setMsg((m) => ({ ...m, [p]: r.ok ? `✓ ${t("Saved")}` : `⚠ ${j.detail ?? j.error ?? "error"}` }));
    if (r.ok) { setDraft((d) => ({ ...d, [p]: "" })); load(); }
  }
  async function planStart() {
    setPlan({ code: "", msg: t("Opening…") });
    const r = await fetch("/api/settings/claude", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ step: "start" }) });
    const j = await r.json().catch(() => ({}));
    setPlan(r.ok ? { url: j.url, code: "" } : { code: "", msg: `⚠ ${j.error ?? "error"}` });
  }
  async function planFinish() {
    setPlan((p) => ({ ...p, msg: t("Checking…") }));
    const r = await fetch("/api/settings/claude", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ step: "finish", code: plan.code.trim() }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) { setPlan({ code: "", msg: `✓ ${t("Saved")}` }); load(); } else setPlan((p) => ({ ...p, msg: `⚠ ${j.error ?? "error"}` }));
  }
  async function patch(body: object) { await fetch("/api/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); load(); }
  // Same look as AI Soul's settings (2026-09-30 screenshot pairs): bold heading and grey note sit on the page, not inside a card; slimmer boxes.
  const sect = "mb-6 flex flex-col gap-2";
  const h2 = "font-bold";
  const input = "rounded-lg border border-line bg-surface px-2 py-1.5 text-sm outline-none focus:border-fg-2";
  const hasKey = (p: string) => me.keys.find((k) => k.provider === p);
  const tabBtn = (on: boolean) => `${on ? "rounded-lg bg-ink text-on-ink px-1 md:px-3 py-1.5" : "rounded-lg border border-line-2 bg-surface px-1 md:px-3 py-1.5"} min-w-0 leading-tight [overflow-wrap:anywhere]`;   // long tab names wrap on phones (German, Finnish …)
  const TABS: { id: Tab; en: string; short: string; about?: string }[] = [
    { id: "status", en: k("Status"), short: k("Status") }, { id: "ai", en: k("AI#tab"), short: k("AI#tab") }, { id: "memory", en: k("Memory & rules"), short: k("Memory#tab") },
    { id: "files", en: k("Files"), short: k("Files"), about: k("Find the files you attached or the AI made, and download all your data.") },
    { id: "screen", en: k("Screen & alerts"), short: k("Screen#tab"), about: k("Brightness, language and how Unchore lets you know when something is done.") },
    { id: "device", en: k("Devices & security"), short: k("Devices#tab"), about: k("Where you're signed in, saved logins and privacy. If you see a device you don't know, sign it out.") },
  ];
  const about = (id: Tab) => { const x = TABS.find((y) => y.id === id)!; return x.about ? <p className="text-sm text-fg-2 mb-3" data-testid={`tab-about-${id}`}><b>{t(x.en)}</b> — {t(x.about)}</p> : null; };
  const go = (x: Tab) => { setTab(x); try { window.history.replaceState(window.history.state, "", x === "status" ? "/app/settings" : `/app/settings?tab=${x}`); } catch { /* the screen still changes */ } };
  const aiCount = me.keys.length;
  const active = autos.filter((a) => a.status === "active").length, broken = autos.filter((a) => a.status === "broken").length;
  const todo = !aiCount ? (t("connect your Claude plan (or an AI key)")) : broken ? (t("check {broken} paused automation(s)", { broken })) : "";
  const summary = `${t(todo ? "Something needs you" : "All good")} · ${t("{n} AI connection(s)", { n: aiCount })} · ${t("{n} automation(s) on", { n: active })}`;
  const pill = (ok: boolean, text: string) => <span className={`rounded-full px-2 py-0.5 text-xs ${ok ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-pill text-subtle"}`}>{text}</span>;
  const levelWord = (n: number) => { const w = [k("Off"), k("Weekly"), k("Every other day"), k("Daily"), k("Twice a day"), k("Three times a day")][n]; return w ? t(w) : ""; };
  const setThemeTo = (v: string) => { setTheme(v); localStorage.setItem("uc_theme", v); const dk = v === "dark" || v === "night" || (v === "auto" && matchMedia("(prefers-color-scheme: dark)").matches); document.documentElement.classList.toggle("dark", dk); document.documentElement.classList.toggle("night", v === "night"); };
  return (
    <div className="h-full overflow-y-auto px-4 md:px-8 py-4" data-testid="settings">
      <h1 className="text-lg md:text-xl font-bold mb-0.5">{t("Settings")}</h1>
      {memRemoval.undo && <UndoBar text={memRemoval.undo.text} label={t("Undo")} onUndo={memRemoval.cancel} />}
      <p className="text-sm text-fg-2 mb-2" data-testid="settings-summary">{summary}<span className="text-fg-3"> · {t("To do")}: {todo ? <button type="button" className="underline" onClick={() => go(aiCount ? "status" : "ai")}>{todo}</button> : (t("nothing right now"))}</span></p>
      <div role="tablist" className="grid grid-cols-3 sm:grid-cols-6 gap-1 md:flex md:gap-2 mb-2 md:mb-3 text-[13px] md:text-sm" data-testid="settings-tabs">
        {TABS.map((x) => <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} aria-label={t(x.en)} title={t(x.en)} onClick={() => go(x.id)} className={tabBtn(tab === x.id)} data-testid={`settings-tab-${x.id}`}><span className="md:hidden">{t(x.short)}</span><span className="hidden md:inline">{t(x.en)}</span></button>)}
      </div>

      <div role="tabpanel" hidden={tab !== "status"}>
        <h2 className="font-bold mb-1 text-sm">{t("AI connections")} <span className="font-normal text-subtle">— {t("answers use your own plan or keys; your Claude plan goes first")}</span></h2>
        <div className={sect}>
          <div className="flex flex-wrap items-center gap-2 text-sm"><b>{t("Claude plan")}</b>{hasKey("claude_sub") ? <><span className="text-muted">{hasKey("claude_sub")!.hint}</span>{pill(true, t("ready"))}</> : pill(false, t("not connected"))}<button type="button" className="ml-auto rounded border border-line-2 px-2 py-0.5 text-xs text-fg-2 hover:bg-hover" onClick={() => go("ai")}>✎ {t("Change")}</button></div>
          <div className="flex flex-wrap items-center gap-2 text-sm border-t border-line-soft pt-2"><b>{t("ChatGPT plan")}</b>{hasKey("chatgpt_sub") ? <><span className="text-muted">{hasKey("chatgpt_sub")!.hint}</span>{pill(true, t("ready"))}</> : pill(false, t("not connected"))}</div>
          {me.providers.filter((p) => !isPlan(p)).map((p) => <div key={p} className="flex flex-wrap items-center gap-2 text-sm border-t border-line-soft pt-2"><b>{NAME[p]}</b>{hasKey(p) ? <><span className="text-muted">{hasKey(p)!.hint}</span>{pill(true, t("ready"))}</> : pill(false, t("no key"))}</div>)}
        </div>
        <h2 className="font-bold mb-1 text-sm">{t("Running on their own")}</h2>
        <div className={sect}>
          <div className="flex flex-wrap items-center gap-3 text-sm"><span>{t("Automations on")} <b>{active}</b></span><span>{t("Paused#count")} <b className={broken ? "text-red-700 dark:text-red-400" : ""}>{broken}</b></span><a href="/app/automations" className="ml-auto text-xs underline text-subtle">{t("Open automations →")}</a></div>
          <div className="flex flex-wrap items-center gap-2 text-sm border-t border-line-soft pt-2"><span>☀ {t("Daily note")}</span><b>{levelWord(u.nudge_level ?? 3)}</b>{(u.nudge_level ?? 3) > 0 ? <span className="text-subtle">· {u.nudge_at ?? "08:00"}</span> : null}<button type="button" className="ml-auto rounded border border-line-2 px-2 py-0.5 text-xs text-fg-2 hover:bg-hover" onClick={() => go("screen")}>✎ {t("Change")}</button></div>
          <p className="text-xs text-subtle">{t("The daily note adjusts to how you respond. A paused automation couldn't read a value with certainty three times in a row — it stops rather than send a guess.")}</p>
        </div>
      </div>

      <div role="tabpanel" hidden={tab !== "ai"}>
        <Credits />
        <section className={sect}>
          <h2 className={h2}>{t("Your Claude plan (Pro / Max)")}</h2>
          <p className="text-sm text-fg-2">{t("Already pay for Claude? Use it here at no extra cost. You sign in on Anthropic's own page — Unchore never sees your Claude password.")}</p>
          {hasKey("claude_sub") ? (
            <div className="flex items-center gap-2 text-sm"><span className="flex-1">✓ {hasKey("claude_sub")!.hint}</span>
              <button onClick={async () => { await fetch("/api/settings/claude", { method: "DELETE" }); setPlan({ code: "" }); load(); }} className="rounded-lg border border-line px-3 py-1">{t("Disconnect")}</button></div>
          ) : !plan.url ? (
            <button onClick={planStart} className="w-fit rounded-lg bg-ink text-on-ink px-4 py-2">{t("Connect my Claude plan")}</button>
          ) : (
            <div className="flex flex-col gap-2 text-sm">
              <a href={plan.url} target="_blank" rel="noreferrer" className="w-fit rounded-lg border border-line px-3 py-2 underline">{t("1. Open Claude sign-in and press «Authorize»")} ↗</a>
              <div>{t("2. Copy the code Claude shows and paste it here")}</div>
              <div className="flex gap-2">
                <input autoComplete="off" value={plan.code} onChange={(e) => setPlan((x) => ({ ...x, code: e.target.value }))} className={`${input} flex-1`} />
                <button onClick={planFinish} disabled={plan.code.trim().length < 10} className="rounded-lg bg-ink text-on-ink px-3 disabled:opacity-40">{t("Connect")}</button>
              </div>
            </div>
          )}
          {plan.msg && <div className="text-xs text-fg-2">{plan.msg}</div>}
        </section>
        <section className={sect}>
          <h2 className={h2}>{t("Your ChatGPT plan (Plus / Pro)")}</h2>
          {hasKey("chatgpt_sub") ? (
            <div className="flex items-center gap-2 text-sm"><span className="flex-1">✓ {hasKey("chatgpt_sub")!.hint}</span>
              <button onClick={async () => { await fetch("/api/settings/chatgpt", { method: "DELETE" }); load(); }} className="rounded-lg border border-line px-3 py-1">{t("Disconnect")}</button></div>
          ) : (
            <p className="text-sm text-fg-2">{t("Type {cmd} in the chat — two taps, and you never leave the chat.", { cmd: `«${t("connect ChatGPT")}»` })}</p>
          )}
        </section>
        <section className={sect}>
          <h2 className={h2}>{t("AI keys")} <span className="font-normal text-muted">— {t("Or use an API key")}</span></h2>
          <p className="text-sm text-fg-2">{t("Unchore answers with your own key. Stored encrypted; only the last 4 characters are shown.")}</p>
          {me.providers.filter((p) => !isPlan(p)).map((p) => (
            <div key={p} className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 text-sm"><b>{NAME[p]}</b>{hasKey(p) && <span className="text-muted">{hasKey(p)!.hint}</span>}<a href={KEY_URL[p]} target="_blank" rel="noreferrer" className="ml-auto text-xs underline text-muted">{t("Get a key")}</a></div>
              <div className="flex gap-2">
                <SecretInput autoComplete="off" value={draft[p] ?? ""} onChange={(v) => setDraft((d) => ({ ...d, [p]: v }))} placeholder={hasKey(p) ? "••••••••" : "sk-…"} className={`${input} w-full`} wrap="flex-1 min-w-0" />
                <button onClick={() => saveKey(p)} disabled={!(draft[p] ?? "").trim()} className="shrink-0 whitespace-nowrap rounded-lg bg-ink text-on-ink px-3 disabled:opacity-40">{t("Save")}</button>
                {hasKey(p) && <button onClick={async () => { await fetch(`/api/settings/keys?provider=${p}`, { method: "DELETE" }); load(); }} className="shrink-0 whitespace-nowrap rounded-lg border border-line px-3">{t("Remove#key")}</button>}
              </div>
              {msg[p] && <div className="text-xs text-fg-2">{msg[p]}</div>}
            </div>
          ))}
        </section>
        <section className={`${sect} scroll-mt-4`} id="google">
          <GoogleConnect />
        </section>
        <section className={`${sect} scroll-mt-4`} id="telegram">
          <TelegramConnect />
        </section>
        <section className={`${sect} scroll-mt-4`} id="slack-discord">
          <ChatAppsConnect />
        </section>
        <section className={`${sect} scroll-mt-4`} id="alerts-in">
          <InboxHooks />
        </section>
        <section className={`${sect} scroll-mt-4`} id="computers">
          <ComputersConnect />
        </section>
        <section className={`${sect} scroll-mt-4`} id="mcp">
          <McpServers />
        </section>
        <section className={sect}>
          <h2 className={h2}>{t("Who answers")}</h2>
          <label className="flex items-center justify-between gap-3 text-sm">{t("Default AI")}
            <select value={u.default_model ?? ""} onChange={(e) => patch({ default_model: e.target.value || null })} className={`${input} min-w-0 max-w-[60%]`}>
              <option value="">{t("Auto")}</option>
              <option value="auto">✨ {t("Auto-pick per question")}</option>
              {me.providers.filter((p) => hasKey(p)).flatMap((p) => me.models[p]!.map((m) => { const b = modelBlurb(m.id); return <option key={m.id} value={m.id}>{b ? `${m.label} — ${t(b)}` : m.label}</option>; }))}
            </select>
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">{t("Rewrite hard answers in plain words — long or technical answers are checked and rewritten once (uses your AI once or twice more)")}
            <input type="checkbox" checked={u.plain_gate === true} onChange={(e) => patch({ plain_gate: e.target.checked })} data-testid="plain-gate" />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">{t("Mark chats that wait for my reply (🟠) — my AI double-checks unclear answers with a tiny extra request")}
            <input type="checkbox" checked={u.ask_judge !== false} onChange={(e) => patch({ ask_judge: e.target.checked })} data-testid="ask-judge" />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">{t("Keep going until it's really done — after a task, my strongest AI checks the answer and, if there's more it can do itself, carries on in the same chat (up to 6 times; uses my AI more)")}
            <input type="checkbox" checked={u.keep_going !== false} onChange={(e) => patch({ keep_going: e.target.checked })} data-testid="keep-going" />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">{t("Let the AI search the web when needed (Claude / OpenRouter keys)")}
            <input type="checkbox" checked={u.web_search !== false} onChange={(e) => patch({ web_search: e.target.checked })} />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">{t("Let my Claude plan read my claude.ai connectors (Notion, Slack, Drive…) — read only, nothing is changed or sent")}
            <input type="checkbox" checked={u.claude_connectors === true} onChange={(e) => patch({ claude_connectors: e.target.checked })} data-testid="claude-connectors" />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">{t("I'm mostly")}
            <select value={u.face ?? "general"} onChange={(e) => patch({ face: e.target.value })} className={input}>
              {[["student", k("Student")], ["worker", k("Office work")], ["shop", k("Shop / business")], ["builder", k("Developer / founder")], ["senior", k("Keep it simple & large")], ["general", k("Just general")]].map(([v, l]) => <option key={v} value={v}>{t(l!)}</option>)}
            </select>
          </label>
          <p className="text-xs text-subtle">{t("«I'm mostly» sets the tone and what Unchore suggests first. With OpenRouter connected, Unchore picks when a question needs the strong AI.")}</p>
        </section>
      </div>

      <div role="tabpanel" hidden={tab !== "memory"}>
        <section className={sect}>
          <h2 className={h2}>{t("My instructions")}</h2>
          <p className="text-sm text-fg-2">{t("Standing instructions for every chat (tone, format, what to always do or avoid).")}</p>
          <textarea value={rules ?? u.instructions ?? ""} onChange={(e) => { setRules(e.target.value); setRulesMsg(""); }} rows={6} className={`${input} text-sm`} />
          <div className="flex items-center gap-2"><button onClick={async () => { await patch({ instructions: rules ?? u.instructions ?? "" }); setRulesMsg(`✓ ${t("Saved")}`); setRulesRev((n) => n + 1); }} className="rounded-lg bg-ink text-on-ink px-3 py-1.5 text-sm">{t("Save")}</button><span className="text-xs text-muted">{rulesMsg}</span><span className="ml-auto text-xs text-faint">{(rules ?? u.instructions ?? "").length.toLocaleString()} / 30,000</span></div>
          <RulesHistory lang={lang} rev={rulesRev} onRestore={async (text) => { setRules(text); await patch({ instructions: text }); setRulesMsg(`✓ ${t("Put back")}`); setRulesRev((n) => n + 1); }} />
        </section>
        <MyWords />
        <section className={sect}>
          <h2 className={h2}>{t("Memory")} <span className="font-normal text-muted">({memShown.length})</span></h2>
          <p className="text-sm text-fg-2">{t("Unchore notes lasting facts about you after each answer. Health, money, IDs and contact details are never saved.")}</p>
          <label className="flex items-center justify-between gap-3 text-sm">{t("Remember things about me")}<input type="checkbox" checked={u.memory_on !== false} onChange={(e) => patch({ memory_on: e.target.checked })} /></label>
          {/* AI Soul «대화에서 기억을 스스로 적기»: off = saved memories still used, the AI just stops adding to them */}
          <label className={`flex items-center justify-between gap-3 text-sm pl-4 ${u.memory_on === false ? "opacity-40" : ""}`}>{t("Let the AI add new memories from chats")}<input type="checkbox" disabled={u.memory_on === false} checked={u.memory_write !== false} onChange={(e) => patch({ memory_write: e.target.checked })} data-testid="memory-write-toggle" /></label>
          <div className="flex gap-2"><textarea value={newMem} onChange={(e) => setNewMem(e.target.value)} rows={newMem.includes("\n") ? 5 : 1} placeholder={t("Add a memory — paste many lines to add one per line (a Claude memory export works too)")} className={`${input} flex-1 text-sm resize-y`} />
            <button disabled={newMem.trim().length < 2} onClick={async () => {
              const many = newMem.trim().includes("\n") || newMem.trim().length > 300;
              const r = await fetch(many ? "/api/memories/import" : "/api/memories", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: newMem }) });
              const j = await r.json().catch(() => ({}));
              if (!r.ok) { alert(j.error === "sensitive" ? (t("Health, money, IDs and contact details aren't kept in memory.")) : (t("Couldn't add it."))); return; }
              setNewMem(""); loadMems();
              if (many) alert([t("✓ Added {n}", { n: j.added }), j.same ? t("{n} already there", { n: j.same }) : "", j.skipped ? t("{n} heading lines left out", { n: j.skipped }) : "", j.refused?.length ? t("{n} sensitive left out", { n: j.refused.length }) : ""].filter(Boolean).join(" · "));
            }} className="rounded-lg bg-ink text-on-ink px-3 text-sm disabled:opacity-40">{t("Save")}</button></div>
          <div className="flex flex-col gap-1 max-h-96 overflow-y-auto">
            {memShown.map((m) => (
              <div key={m.id} className="flex items-start gap-2 text-sm rounded-lg px-2 py-1 hover:bg-hover">
                <span className="flex-1">{m.text}</span>
                <button className="text-muted hover:text-fg" onClick={async () => { const n = prompt("", m.text); if (n && n.trim() !== m.text) { await fetch(`/api/memories/${m.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: n.trim() }) }); loadMems(); } }}>✎</button>
                <button className="text-muted hover:text-red-600" aria-label={t("Delete")} onClick={() => memRemoval.schedule(`/api/memories/${m.id}`, t("Memory deleted"))}>×</button>
              </div>
            ))}
          </div>
        </section>
        <MemoryHistory lang={lang} rev={mems.length} onPutBack={async (text) => { await fetch("/api/memories", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) }); loadMems(); }} />
        <MyNotes lang={lang} />
        <CallImport />
        <MySkills lang={lang} />
        <Taste />
      </div>

      <div role="tabpanel" hidden={tab !== "files"} data-testid="settings-panel-files">
        {about("files")}
        <MyFiles lang={lang} />
        <section className={sect}>
          <h2 className={h2}>{t("Download all my data")}</h2>
          <a href="/api/export" className="w-fit text-sm underline" data-testid="export-all">⬇ {t("Download all my data (JSON)")}</a>
        </section>
        <section className={sect}>
          <h2 className={h2}>{t("Bring chats from another AI app")}</h2>
          <label className="w-fit text-sm underline cursor-pointer">⬆ {t("Import ChatGPT / Claude chats (the export ZIP as downloaded, or conversations.json)")}
            <input type="file" accept=".json,.zip,application/json,application/zip" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; const { ok, j } = await sendImport(f); alert(ok ? [t("✓ Imported {imported} chats", { imported: j.imported ?? 0 }), j.skipped ? t("{skipped} were already here, so they weren't added again.", { skipped: j.skipped }) : "", j.more ? t("{more} more — upload the same file again to bring the next ones.", { more: j.more }) : ""].filter(Boolean).join("\n") : `⚠ ${importError(j.error, t)}`); if (ok) window.dispatchEvent(new Event("uc:convs")); }} />
          </label>
        </section>
      </div>

      <div role="tabpanel" hidden={tab !== "screen"} data-testid="settings-panel-screen">
        {about("screen")}
        <section className={`${sect} scroll-mt-4`} id="notifications">
          <h2 className={h2}>{t("Notifications")}</h2>
          <PushToggle />
          <label className="flex items-center justify-between gap-3 text-sm">{t("In voice mode, say it aloud when a long job finishes")}
            <input type="checkbox" data-testid="voice-announce-toggle" checked={announce} onChange={(e) => { setAnnounce(e.target.checked); try { localStorage.setItem(ANNOUNCE_KEY, e.target.checked ? "1" : "0"); } catch { /* private mode */ } }} />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">{t("E-mail me automation results")}
            <input type="checkbox" checked={u.notify_email} onChange={(e) => patch({ notify_email: e.target.checked })} />
          </label>
          <label className="flex flex-wrap items-center justify-between gap-3 text-sm"><span className="whitespace-nowrap">{t("Daily note (Unchore speaks first)")}</span>
            <span className="flex flex-wrap justify-end gap-2">
              <select value={u.nudge_level ?? 3} onChange={(e) => patch({ nudge_level: Number(e.target.value) })} className={input}>
                {[0, 1, 2, 3, 4, 5].map((i) => <option key={i} value={i}>{i === 0 ? (t("Off#choice")) : levelWord(i)}</option>)}
              </select>
              <input type="time" defaultValue={u.nudge_at ?? "08:00"} onBlur={(e) => e.target.value && e.target.value !== u.nudge_at && patch({ nudge_at: e.target.value })} className={input} />
            </span>
          </label>
          <p className="text-xs text-muted">{t("Starts once a day and adjusts to how you respond. You can also just say «stop» or «make it 9pm» in chat.")}</p>
        </section>
        <VoicePicker lang={lang} />
        <section className={sect}>
          <h2 className={h2}>{t("Brightness")}</h2>
          <div className="flex flex-wrap gap-2 text-sm">{(["auto", "light", "dark", "night"] as const).map((v) => <button key={v} type="button" onClick={() => setThemeTo(v)} className={(theme === v ? "rounded-lg bg-ink text-on-ink" : "rounded-lg border border-line-2 bg-surface") + " px-3 py-1.5 whitespace-nowrap"}>{t({ auto: k("System"), light: k("Light"), dark: k("Dark"), night: k("Night sky") }[v])}</button>)}</div>
          <label className="flex items-center justify-between gap-3 text-sm">{t("Language")}
            <select value={u.lang} onChange={(e) => { document.cookie = `uc_lang=${e.target.value};path=/;max-age=31536000`; patch({ lang: e.target.value }).then(() => location.reload()); }} className={`${input} min-w-0 max-w-[62%]`}>
              {LANGS.map((l) => <option key={l.code} value={l.code}>{l.name}{l.code === "en" ? "" : ` · ${l.en}`}</option>)}
            </select>
          </label>
          <label className="flex items-center justify-between gap-3 text-sm"><span>{t("Time zone")}<span className="block text-xs text-muted">{tzLabel(u.tz, lang, t)}</span></span>
            <input defaultValue={u.tz} onBlur={(e) => e.target.value !== u.tz && patch({ tz: e.target.value })} className={`${input} min-w-0 w-44`} />
          </label>
        </section>
      </div>

      <div role="tabpanel" hidden={tab !== "device"} data-testid="settings-panel-device">
        {about("device")}
        <section className={sect}>
          <h2 className={h2}>{t("Account")}</h2>
          <div className="text-sm text-fg-2 truncate">{u.name ?? u.email} · {u.email}</div>
          <DeviceList lang={lang} />
          <DeviceLink />
          <form action="/api/auth/logout-all" method="post" onSubmit={(e) => { if (!confirm(t("Sign out on every device, including this one?"))) e.preventDefault(); }}><button className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-hover" data-testid="logout-all">{t("Sign out everywhere")}</button></form>
        </section>
        <section className={sect}>
          <h2 className={h2}>{t("Saved logins")}</h2>
          <p className="text-sm text-fg-2">{t("For sites your automations sign in to. Encrypted; never shown again after saving.")}</p>
          {vault.map((v) => (
            <div key={v.name} className="flex items-center gap-2 text-sm"><span className="flex-1">{v.name}</span><span className="text-muted">{v.hint}</span>
              <button onClick={async () => { await fetch(`/api/vault?name=${encodeURIComponent(v.name)}`, { method: "DELETE" }); load(); }} className="rounded-lg border border-line px-2 py-0.5">{t("Remove#key")}</button></div>
          ))}
          <div className="flex flex-col md:flex-row gap-2">
            <input value={vName} onChange={(e) => setVName(e.target.value)} placeholder={t("Name (e.g. airline-login)")} className={`${input} flex-1 min-w-32`} />
            <SecretInput autoComplete="new-password" value={vVal} onChange={setVVal} placeholder={t("Value")} className={`${input} w-full`} wrap="flex-1 min-w-32" />
            <button onClick={async () => { const r = await fetch("/api/vault", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: vName, value: vVal }) }); if (r.ok) { setVName(""); setVVal(""); load(); } }} disabled={!vName || !vVal} className="rounded-lg bg-ink text-on-ink px-3 disabled:opacity-40">{t("Save")}</button>
          </div>
        </section>
        <section className={sect}>
          <h2 className={h2}>{t("Privacy")}</h2>
          <p className="text-sm text-fg-2">{t("Your chats, files and memories are stored encrypted, so they can't be read from the database. The app opens them only to show them to you and to send them to your AI.")}</p>
          <label className="flex items-center justify-between gap-3 text-sm">{t("Help improve Unchore")}<input type="checkbox" checked={u.improve !== false} onChange={(e) => patch({ improve: e.target.checked })} /></label>
          <p className="text-xs text-muted">{t("When on, a copy of each chat turn is kept with names, e-mail, phone, card, ID, account and address details removed and nothing that links it to you. It is used only to find where Unchore gets things wrong, and deleted after 90 days. When off, we keep only usage counts (how often you chat, where something failed) — never what you wrote.")}</p>
        </section>
        {/* Sign out of this device on its own, under everything else (AI Soul 06406d5 logout-zone) — not next to the account name where it was pressed by mistake */}
        <section className={`${sect} border-t border-line-soft pt-4`} data-testid="logout-zone">
          <form action="/api/auth/logout" method="post"><button className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-hover" data-testid="logout">{t("Sign out")} · {t("This device")}</button></form>
        </section>
        {/* Hard to undo, so on its own at the very bottom, away from everyday buttons */}
        <section className={`${sect} border-t border-line-soft pt-4`} data-testid="danger-zone">
          <button onClick={async () => { if (confirm(t("Delete your account, chats and automations? This can't be undone."))) { await fetch("/api/settings", { method: "DELETE" }); location.assign(window.location.origin); } }} className="w-fit text-sm text-red-600 underline">{t("Delete my account")}</button>
        </section>
      </div>
    </div>
  );
}

// Signed-in devices (ported from AI Soul): name · last used · «Sign out» for any other device. This device is marked, first, and signs out at the bottom of the tab.
function DeviceList({ lang }: { lang: Lang }) {
  const t = useT();
  const [rows, setRows] = useState<{ id: string; device: string | null; created_at: string; seen_at: string; current: boolean }[]>([]);
  const load = () => { fetch("/api/me/devices").then((r) => (r.ok ? r.json() : [])).then(setRows).catch(() => {}); };
  useEffect(load, []);
  if (!rows.length) return null;
  const when = (iso: string) => new Intl.DateTimeFormat(lang, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  return (
    <div className="flex flex-col gap-1" data-testid="devices">
      <div className="text-sm font-medium">{t("Signed-in devices")} <span className="font-normal text-muted" data-testid="device-count">({rows.length})</span></div>
      <p className="text-xs text-muted">{t("Devices signed in to your account — this one first, then the most recently used.")}</p>
      {[...rows].sort((a, b) => Number(b.current) - Number(a.current) || b.seen_at.localeCompare(a.seen_at)).map((d) => (
        <div key={d.id} className={`flex items-center gap-2 text-sm rounded-lg border px-2 py-1 ${d.current ? "border-green-600/50" : "border-transparent"}`} data-testid="device-item">
          <span className="flex-1 min-w-0 truncate">{d.device || t("Unknown device")}{d.current ? <span className="ml-1.5 text-xs rounded-full px-2 py-0.5 bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">{t("This device")}</span> : null}<span className="block text-xs text-muted">{t("Last used {when}", { when: when(d.seen_at) })}</span></span>
          {d.current ? null : <button type="button" onClick={async () => { await fetch(`/api/me/devices?d=${d.id}`, { method: "DELETE" }); load(); }} className="shrink-0 rounded-lg border border-line px-2 py-0.5 text-xs hover:bg-hover">{t("Sign out#device")}</button>}
        </div>
      ))}
    </div>
  );
}

// «Sign in on another device» (ported from AI Soul): a one-time link, shown only here, opened on the phone — the app opens signed in.
function DeviceLink() {
  const t = useT();
  const [link, setLink] = useState("");
  const [msg, setMsg] = useState("");
  const make = async () => {
    const r = await fetch("/api/auth/device-link", { method: "POST" }).catch(() => null);
    const j = r?.ok ? ((await r.json().catch(() => ({}))) as { url?: string }) : {};
    setLink(j.url ?? "");
    setMsg(j.url ? "" : r?.status === 429 ? t("Too many links — try again later.") : t("Couldn't make the link. Try again."));
  };
  const copy = async () => { try { await navigator.clipboard.writeText(link); setMsg(t("Copied")); } catch { setMsg(t("Couldn't copy. Press and hold the link to copy it.")); } };
  return (
    <div className="flex flex-col gap-1 text-sm" data-testid="device-link-box">
      <div className="font-medium">{t("Sign in on another device")}</div>
      <p className="text-xs text-muted">{t("Make a link and open it on your phone or other computer to sign in there — handy for the Android app if you sign in by e-mail. It works once, for 10 minutes. Don't share it.")}</p>
      <button type="button" onClick={() => void make()} className="w-fit rounded-lg border border-line px-3 py-1.5 hover:bg-hover" data-testid="device-link-make">{t("Make a sign-in link")}</button>
      {link ? (
        <div className="flex items-center gap-2" data-testid="device-link">
          <a href={link} className="flex-1 min-w-0 break-all underline text-xs">{link}</a>
          <button type="button" onClick={() => void copy()} className="shrink-0 rounded-lg border border-line px-2 py-0.5 text-xs hover:bg-hover">{t("Copy")}</button>
        </div>
      ) : null}
      {msg ? <p className="text-xs text-fg-2">{msg}</p> : null}
    </div>
  );
}

const sectBox = "flex flex-col gap-3 border-t border-line-soft pt-5 mt-1";
const when = (iso: string, lang: string) => new Intl.DateTimeFormat(lang, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

// Earlier versions of «My instructions» (lib/rules-history.ts): the latest 20; putting one back keeps the current one.
function RulesHistory({ lang, rev, onRestore }: { lang: Lang; rev: number; onRestore: (text: string) => void }) {
  const t = useT();
  const [rows, setRows] = useState<{ id: string; text: string; created_at: string }[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => { fetch("/api/settings/rules-history").then((r) => (r.ok ? r.json() : [])).then(setRows).catch(() => {}); }, [rev]);
  if (!rows.length) return null;
  return (
    <div className="text-sm" data-testid="rules-history">
      <button type="button" onClick={() => setOpen(!open)} className="text-subtle hover:text-fg">{t("Earlier versions ({n})", { n: rows.length })} {open ? "▾" : "▸"}</button>
      {open && rows.map((r) => (
        <div key={r.id} className="mt-2 rounded-lg border border-line-soft p-2">
          <div className="flex items-center gap-2 text-xs text-muted"><span className="flex-1">{when(r.created_at, lang)} · {r.text.length.toLocaleString()}</span>
            <button type="button" onClick={() => { if (confirm(t("Put this version back? The current one is kept as an earlier version."))) onRestore(r.text); }} className="rounded border border-line-2 px-2 py-0.5 text-fg-2 hover:bg-hover">{t("Put back")}</button></div>
          <div className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap text-xs text-fg-2">{r.text}</div>
        </div>
      ))}
    </div>
  );
}

// «My words» (lib/glossary.ts): «call it Y, not X» — learned when you say so in a chat, or added here.
function MyWords() {
  const t = useT();
  const [rows, setRows] = useState<{ id: string; avoid: string; use: string }[]>([]);
  const [avoid, setAvoid] = useState(""), [use, setUse] = useState("");
  const load = () => { fetch("/api/settings/glossary").then((r) => (r.ok ? r.json() : [])).then(setRows).catch(() => {}); };
  useEffect(load, []);
  return (
    <section className={sectBox} data-testid="my-words">
      <h2 className="font-semibold">{t("My words")} <span className="font-normal text-muted">({rows.length})</span></h2>
      <p className="text-sm text-fg-2">{t("Say «call it Y, not X» in any chat and every answer uses your word from then on.")}</p>
      {rows.map((r) => (
        <div key={r.id} className="flex items-center gap-2 text-sm"><span className="flex-1 min-w-0 truncate"><s className="text-muted">{r.avoid}</s> → <b>{r.use}</b></span>
          <button type="button" className="text-muted hover:text-red-600" aria-label={t("Delete")} onClick={async () => { await fetch(`/api/settings/glossary?id=${r.id}`, { method: "DELETE" }); load(); }}>×</button></div>
      ))}
      <div className="flex flex-wrap gap-2">
        <input value={avoid} onChange={(e) => setAvoid(e.target.value)} placeholder={t("Instead of")} className="flex-1 min-w-24 rounded-lg border border-line bg-page px-2 py-1 text-sm" />
        <input value={use} onChange={(e) => setUse(e.target.value)} placeholder={t("Say")} className="flex-1 min-w-24 rounded-lg border border-line bg-page px-2 py-1 text-sm" />
        <button type="button" disabled={!avoid.trim() || !use.trim()} onClick={async () => { const r = await fetch("/api/settings/glossary", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ avoid, use }) }); if (r.ok) { setAvoid(""); setUse(""); load(); } }} className="rounded-lg bg-ink text-on-ink px-3 text-sm disabled:opacity-40">{t("Save")}</button>
      </div>
    </section>
  );
}

// How memory learned (lib/memory-log.ts): the latest 100 changes; a dropped memory can be put back.
function MemoryHistory({ lang, rev, onPutBack }: { lang: Lang; rev: number; onPutBack: (text: string) => void }) {
  const t = useT();
  const [rows, setRows] = useState<{ id: string; action: string; text: string; by_ai: boolean; conversation_id: string | null; created_at: string }[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => { if (open) fetch("/api/memories/log").then((r) => (r.ok ? r.json() : [])).then(setRows).catch(() => {}); }, [open, rev]);
  const word = { added: t("Noted"), updated: t("Changed"), removed: t("Dropped") } as Record<string, string>;
  return (
    <section className={sectBox} data-testid="memory-history">
      <button type="button" onClick={() => setOpen(!open)} className="w-fit font-semibold">{t("How memory learned")} {open ? "▾" : "▸"}</button>
      {open && !rows.length ? <p className="text-sm text-muted">{t("Nothing yet.")}</p> : null}
      {open && rows.map((r) => (
        <div key={r.id} className="flex items-start gap-2 text-sm">
          <span className="shrink-0 w-28 text-xs text-muted">{when(r.created_at, lang)}</span>
          <span className="flex-1 min-w-0"><b className="text-xs">{word[r.action] ?? r.action}</b> <span className="text-xs text-muted">· {r.by_ai ? t("by the AI") : t("by you")}</span>{r.conversation_id ? <a href={`/app?c=${r.conversation_id}`} className="text-xs text-muted underline ml-1">{t("chat")}</a> : null}<span className="block text-fg-2">{r.text}</span></span>
          {r.action === "removed" ? <button type="button" onClick={() => onPutBack(r.text)} className="shrink-0 rounded border border-line-2 px-2 py-0.5 text-xs hover:bg-hover">{t("Put back")}</button> : null}
        </div>
      ))}
    </section>
  );
}

// «My notes» (lib/notes.ts): what chats settled, filed as notes that grow; read, delete, or take them to Obsidian.
type NoteRow = { id: string; title: string; body: string; tags: string[]; source_conversation: string | null; updated_at: string };
function MyNotes({ lang }: { lang: Lang }) {
  const t = useT();
  const [rows, setRows] = useState<NoteRow[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [find, setFind] = useState("");
  const load = () => { fetch("/api/notes").then((r) => (r.ok ? r.json() : [])).then(setRows).catch(() => {}); };
  useEffect(load, []);
  const removal = useDelayedDelete(() => { load(); });
  const kept = rows.filter((n) => removal.undo?.url !== `/api/notes/${n.id}`);
  const shown = findNotes(kept, find);
  return (
    <section className={`${sectBox} scroll-mt-4`} id="my-notes" data-testid="my-notes">
      {removal.undo && <UndoBar text={removal.undo.text} label={t("Undo")} onUndo={removal.cancel} />}
      <h2 className="font-semibold">{t("My notes")} <span className="font-normal text-muted">({kept.length})</span></h2>
      <p className="text-sm text-fg-2">{t("When a chat settles something — a decision, a plan, a method that worked — Unchore files it here and builds on it next time. On while «Remember things about me» is on.")}</p>
      {kept.length ? <a href="/api/notes/export" download className="w-fit text-sm underline">⬇ {t("Download for Obsidian (.zip)")}</a> : <p className="text-sm text-muted">{t("Nothing yet.")}</p>}
      {kept.length > 5 && <input type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder={t("Search notes")} aria-label={t("Search notes")} className="rounded-lg border border-line px-3 py-1.5 text-sm bg-transparent" data-testid="notes-search" />}
      <div className="flex flex-col gap-1 max-h-[32rem] overflow-y-auto">
        {shown.map((n) => (
          <div key={n.id} className="rounded-lg px-2 py-1 text-sm hover:bg-hover" data-testid="note-row">
            <div className="flex items-start gap-2">
              <button type="button" onClick={() => setOpen(open === n.id ? null : n.id)} className="flex-1 min-w-0 text-left"><b>{n.title}</b> <span className="text-xs text-muted">· {when(n.updated_at, lang)}{n.tags.length ? ` · ${n.tags.join(", ")}` : ""}</span></button>
              <button type="button" className="text-muted hover:text-red-600" aria-label={t("Delete")} onClick={() => removal.schedule(`/api/notes/${n.id}`, t("Note deleted"))}>×</button>
            </div>
            {open === n.id ? <div className="mt-1 text-fg-2"><Markdown text={n.body} />{n.source_conversation ? <a href={`/app?c=${n.source_conversation}`} className="text-xs text-muted underline">{t("chat")}</a> : null}</div> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

// «My skills» (lib/skills.ts — Claude Code skills, Hermes Agent's learning loop): how-tos the AI saved from work that went well.
/** Calls → requests (lib/call-intake.ts · app/api/calls): off until the member ticks the notice; then recordings they add become
 *  words (the sound is deleted) and, three times a day, a note of what was asked of them — on their own AI key. */
type CallState = { on: boolean; since: string | null; used: number; max: number; waiting: number; done: number; hasKey: boolean };
function CallImport() {
  const t = useT();
  const [s, setS] = useState<CallState | null>(null);
  const [agree, setAgree] = useState(false);
  const [msg, setMsg] = useState("");
  const load = () => { fetch("/api/calls").then((r) => (r.ok ? r.json() : null)).then(setS).catch(() => {}); };
  useEffect(load, []);
  if (!s) return null;
  const turn = async (on: boolean) => { await fetch("/api/calls", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ on, consent: on ? agree : undefined }) }); setAgree(false); load(); };
  async function add(list: FileList | null) {
    for (const f of Array.from(list ?? [])) {
      setMsg(`${t("Reading the words…")} ${f.name}`);
      const seconds = await audioSeconds(f);
      const id = await sendFile(f);
      const r = id ? await fetch("/api/calls", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fileId: id, seconds, modified: f.lastModified || undefined }) }).catch(() => null) : null;
      if (id && !r) await fetch(`/api/files/${id}`, { method: "DELETE" }).catch(() => {});   // never reached the server: the sound isn't kept
      const j = r ? await r.json().catch(() => ({})) as { error?: string; since?: string } : { error: "upload" };
      if (j.error === "daily_cap") { setMsg(t("Today's 60 minutes are used — add the rest tomorrow.")); break; }
      setMsg(r?.ok ? `✓ ${f.name}` : j.error === "before_start" ? t("Only calls from {since} on are taken in.", { since: j.since ?? "" }) : `${t("Couldn't read this recording.")} ${f.name}`);
    }
    load();
  }
  return (
    <section className={sectBox} data-testid="call-import">
      <h2 className="font-semibold">{t("Calls → requests")}</h2>
      <p className="text-sm text-fg-2">{t("Add your call recordings: Unchore turns the speech into text, deletes the sound, and three times a day files what was asked of you — and what you promised — in «My notes», using your own AI key.")}</p>
      {s.on ? (
        <>
          <label className="w-fit cursor-pointer rounded-lg bg-ink text-on-ink px-3 py-1 text-sm">{t("Add call recordings")}<input type="file" accept="audio/*,.m4a,.amr,.3gp,.awb" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} data-testid="call-add" /></label>
          <p className="text-xs text-muted">{t("Today: {used} of {max} minutes", { used: Math.ceil(s.used / 60), max: s.max / 60 })}{s.waiting ? ` · ${t("{n} waiting to be sorted", { n: s.waiting })}` : ""}{s.since ? ` · ${t("Calls from {since} on", { since: s.since })}` : ""}</p>
          {!s.hasKey && <p className="text-xs text-fg-2">{t("Add your own AI key above to have requests sorted — until then the words wait.")}</p>}
          {msg && <p className="text-xs" role="status">{msg}</p>}
          <button type="button" onClick={() => turn(false)} className="w-fit rounded-lg border border-line px-2 py-0.5 text-xs hover:bg-hover" data-testid="call-off">{t("Turn off")}</button>
        </>
      ) : (
        <>
          <p className="text-xs text-fg-2">⚠ {t("Telling the other person that the call is recorded and summarised by AI is your responsibility. In some countries and states their consent is required.")}</p>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} data-testid="call-consent" />{t("I understand, and I'll get consent where it's needed.")}</label>
          <button type="button" disabled={!agree} onClick={() => turn(true)} className="w-fit rounded-lg bg-ink text-on-ink px-3 py-1 text-sm disabled:opacity-40" data-testid="call-on">{t("Turn on")}</button>
        </>
      )}
    </section>
  );
}

/** How long a recording lasts, as the browser reads it (0 when it can't) — so today's minutes are counted before it's read. */
function audioSeconds(f: File): Promise<number> {
  return new Promise((done) => {
    const a = new Audio(), url = URL.createObjectURL(f);
    const end = (n: number) => { URL.revokeObjectURL(url); done(Number.isFinite(n) && n > 0 ? n : 0); };
    a.preload = "metadata"; a.onloadedmetadata = () => end(a.duration); a.onerror = () => end(0);
    setTimeout(() => end(0), 4000); a.src = url;
  });
}

/** One file up (app/api/files, or in pieces over 4 MB — app/api/files/upload) → its id, or null. */
async function sendFile(f: File): Promise<string | null> {
  if (f.size <= 4 * 1024 * 1024) {
    const fd = new FormData(); fd.append("file", f);
    const r = await fetch("/api/files", { method: "POST", body: fd }).catch(() => null);
    return r?.ok ? ((await r.json()) as { id: string }).id : null;
  }
  const r = await fetch("/api/files/upload", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: f.name, mime: f.type, size: f.size }) }).catch(() => null);
  const st = r?.ok ? (await r.json()) as { id: string; partBytes: number; parts: number } : null;
  if (!st) return null;
  for (let i = 0; i < st.parts; i++) if (!(await fetch(`/api/files/upload?id=${st.id}&i=${i}`, { method: "PUT", body: f.slice(i * st.partBytes, (i + 1) * st.partBytes) }).then((x) => x.ok).catch(() => false))) return null;
  const d = await fetch(`/api/files/upload?id=${st.id}&done=1`, { method: "POST" }).catch(() => null);
  return d?.ok ? ((await d.json()) as { id: string }).id : null;
}

function MySkills({ lang }: { lang: Lang }) {
  const t = useT();
  const [rows, setRows] = useState<{ slug: string; description: string; uses: number; updated_at: string }[]>([]);
  const [open, setOpen] = useState<{ slug: string; body: string } | null>(null);
  const load = () => { fetch("/api/skills").then((r) => (r.ok ? r.json() : [])).then(setRows).catch(() => {}); };
  useEffect(load, []);
  const removal = useDelayedDelete(() => { load(); });
  const kept = rows.filter((n) => removal.undo?.url !== `/api/skills?slug=${n.slug}`);
  const show = async (slug: string) => {
    if (open?.slug === slug) { setOpen(null); return; }
    const j = await fetch(`/api/skills?slug=${encodeURIComponent(slug)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null) as { body?: string } | null;
    if (j?.body) setOpen({ slug, body: j.body });
  };
  return (
    <section className={`${sectBox} scroll-mt-4`} id="my-skills" data-testid="my-skills">
      {removal.undo && <UndoBar text={removal.undo.text} label={t("Undo")} onUndo={removal.cancel} />}
      <h2 className="font-semibold">{t("My skills")} <span className="font-normal text-muted">({kept.length})</span></h2>
      <p className="text-sm text-fg-2">{t("When a job goes well, the AI writes down how it did it and follows that the next time. Only for you. Say «remember how you did this» to add one.")}</p>
      {!kept.length && <p className="text-sm text-muted">{t("Nothing yet.")}</p>}
      <div className="flex flex-col gap-1 max-h-[32rem] overflow-y-auto">
        {kept.map((n) => (
          <div key={n.slug} className="rounded-lg px-2 py-1 text-sm hover:bg-hover" data-testid="skill-row">
            <div className="flex items-start gap-2">
              <button type="button" onClick={() => void show(n.slug)} className="flex-1 min-w-0 text-left"><b>{n.slug}</b> <span className="text-xs text-muted">· {n.description} · {when(n.updated_at, lang)}</span></button>
              <button type="button" className="text-muted hover:text-red-600" aria-label={t("Delete")} onClick={() => removal.schedule(`/api/skills?slug=${n.slug}`, t("Skill deleted"))}>×</button>
            </div>
            {open?.slug === n.slug ? <div className="mt-1 text-fg-2"><Markdown text={open.body} /></div> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

// «My files» (AI Soul Settings.tsx «첨부 파일»): every file attached or made, newest first — find by name, open it, or go to its chat.
function MyFiles({ lang }: { lang: Lang }) {
  const t = useT();
  const [rows, setRows] = useState<FileRow[]>([]);
  const [find, setFind] = useState("");
  const [kind, setKind] = useState<FileKind | "all">("all");
  const [now, setNow] = useState(0);
  useEffect(() => {
    const id = setTimeout(() => { fetch(`/api/files${find.trim() ? `?q=${encodeURIComponent(find.trim())}` : ""}`).then((r) => (r.ok ? r.json() : [])).then((x: FileRow[]) => { setRows(x); setNow(Date.now()); }).catch(() => {}); }, 250);
    return () => clearTimeout(id);
  }, [find]);
  // Kind chips and «when» groups (lib/file-groups.ts): narrow by «it was a picture, this week» instead of recalling a name
  const shown = rows.filter((f) => kind === "all" || fileKind(f.name, f.mime) === kind);
  const chip = (on: boolean) => `rounded-full px-2.5 py-1 text-xs ${on ? "bg-ink text-on-ink" : "border border-line-2 bg-surface text-fg-2 hover:bg-hover"}`;
  return (
    <section className={`${sectBox} mb-6 scroll-mt-4`} id="my-files" data-testid="my-files">
      <h2 className="font-semibold">{t("My files")} <span className="font-normal text-muted" data-testid="file-count">({shown.length})</span></h2>
      <input type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder={t("Search file names")} aria-label={t("Search file names")} data-testid="file-search" className="rounded-lg border border-line px-3 py-1.5 text-sm" />
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("File kind")} data-testid="file-kinds">
        <button type="button" aria-pressed={kind === "all"} className={chip(kind === "all")} onClick={() => setKind("all")} data-testid="file-kind-all">{t("All#files")}</button>
        {FILE_KINDS.map((x) => <button key={x.id} type="button" aria-pressed={kind === x.id} className={chip(kind === x.id)} onClick={() => setKind(x.id)} data-testid={`file-kind-${x.id}`}>{x.icon} {t(x.en)}</button>)}
      </div>
      {shown.length ? (
        <div className="flex flex-col gap-2 max-h-[28rem] overflow-y-auto text-sm" data-testid="file-list">
          {DAY_GROUPS.map((g) => {
            const part = shown.filter((f) => dayGroup(f.created_at, now || Date.parse(f.created_at)) === g.id);
            return part.length ? (
              <div key={g.id} data-testid={`file-day-${g.id}`}>
                <div className="text-xs font-medium text-subtle mb-0.5">{t(g.en)} · {part.length}</div>
                <ul className="flex flex-col gap-0.5">
                  {part.map((f) => (
                    <li key={f.id} className="flex flex-wrap items-baseline gap-x-2 rounded px-2 py-1 hover:bg-hover" data-testid="file-item">
                      {/* phone: the name gets its own line and the details go under it — side by side the name was cut to a few letters (live photo 10/2 11:01) */}
                      <a href={`/api/files/${f.id}?view=1`} target="_blank" rel="noreferrer" className="basis-full sm:basis-auto sm:flex-1 min-w-0 truncate underline">{f.made ? "✨ " : `${FILE_KINDS.find((x) => x.id === fileKind(f.name, f.mime))!.icon} `}{f.name}</a>
                      <span className="shrink-0 text-xs text-muted">{f.made ? t("Made by the AI") : t("Uploaded")} · {humanSize(f.size)} · {when(f.created_at, lang)}</span>
                      {/* ⬇ saves it straight away (AI Soul file-download) — without ?view=1 the same address answers as a download */}
                      <a href={`/api/files/${f.id}`} download={f.name} aria-label={`${t("Download")} · ${f.name}`} title={t("Download")} className="shrink-0 rounded px-1.5 text-xs text-muted hover:bg-hover" data-testid="file-download">⬇</a>
                      {f.conversation_id ? <a href={`/app?c=${f.conversation_id}`} className="shrink-0 text-xs text-muted underline">{t("chat")}</a> : null}
                      {/* files over 50 MB share 1 GB per member — they free room here themselves; nothing is deleted for them */}
                      {f.size > ONE_ROW_MAX ? <button type="button" data-testid="file-delete" className="shrink-0 text-xs text-muted underline" onClick={async () => {
                        if (!confirm(t("Delete «{name}»? It can't be undone.", { name: f.name }))) return;
                        if ((await fetch(`/api/files/${f.id}`, { method: "DELETE" }).catch(() => null))?.ok) setRows((x) => x.filter((y) => y.id !== f.id));
                      }}>{t("Delete")}</button> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null;
          })}
        </div>
      ) : <p className="text-sm text-muted">{find.trim() || kind !== "all" ? t("No matching files.") : t("Nothing yet.")}</p>}
    </section>
  );
}

// Taste memory (lib/taste.ts): what your yes/no answers lean to; can be forgotten.
function Taste() {
  const t = useT();
  const [s, setS] = useState<{ votes: number; leanings: { tag: string; score: number }[] } | null>(null);
  const load = () => { fetch("/api/settings/taste").then((r) => (r.ok ? r.json() : null)).then(setS).catch(() => {}); };
  useEffect(load, []);
  if (!s?.votes) return null;
  return (
    <section className={sectBox} data-testid="taste">
      <h2 className="font-semibold">{t("What you usually say yes to")}</h2>
      <p className="text-sm text-fg-2">{t("From your short yes/no answers ({n}), fading over time. Suggestions start on the side you usually pick.", { n: s.votes })}</p>
      <div className="flex flex-wrap gap-1.5 text-xs">{s.leanings.map((l) => <span key={l.tag} className={`rounded-full px-2 py-0.5 ${l.score > 0 ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" : "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200"}`}>{l.score > 0 ? "+" : "−"} {l.tag}</span>)}</div>
      <button type="button" onClick={async () => { if (confirm(t("Forget what you usually say yes or no to?"))) { await fetch("/api/settings/taste", { method: "DELETE" }); load(); } }} className="w-fit text-xs text-muted underline">{t("Forget this")}</button>
    </section>
  );
}

// «Google account» (lib/google-connect.ts): Calendar, Gmail (send only), Drive (picked files only) — connect on Google's own page.
function GoogleConnect() {
  const t = useT();
  const [s, setS] = useState<{ available: boolean; connected: { email: string | null; services: string[] } | null } | null>(null);
  const [pick, setPick] = useState<string[]>(["calendar", "gmail", "drive"]);
  const load = () => { fetch("/api/connect/google").then((r) => (r.ok ? r.json() : null)).then(setS).catch(() => {}); };
  useEffect(load, []);
  const back = useClientValue(() => new URLSearchParams(location.search).get("google"), null);
  if (!s?.available) return null;
  const name: Record<string, string> = { calendar: t("Calendar"), gmail: t("Gmail (send only)"), drive: t("Drive (files you pick)") };
  return (
    <section className="flex flex-col gap-3" data-testid="google-connect">
      <h2 className="font-semibold">{t("Google account")}</h2>
      <p className="text-sm text-fg-2">{t("Let your AI read your calendar and the Drive files you pick, and send mail for you. It never reads your inbox. Adding an event or sending a mail always waits for your «Yes».")}</p>
      {back === "ok" ? <p className="text-sm text-emerald-700">✓ {t("Connected")}</p> : back && back !== "ok" ? <p className="text-sm text-red-600">{t("Couldn't connect — try again")}</p> : null}
      {s.connected?.services.length ? (
        <div className="flex flex-wrap items-center gap-2 text-sm"><span className="flex-1 min-w-0 truncate">✓ {s.connected.email} · {s.connected.services.map((x) => name[x] ?? x).join(" · ")}</span>
          <button type="button" onClick={async () => { await fetch("/api/connect/google", { method: "DELETE" }); load(); }} className="rounded-lg border border-line px-2 py-0.5 text-xs hover:bg-hover">{t("Disconnect")}</button></div>
      ) : null}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {["calendar", "gmail", "drive"].map((x) => <label key={x} className="flex items-center gap-1"><input type="checkbox" checked={pick.includes(x)} onChange={(e) => setPick((p) => (e.target.checked ? [...p, x] : p.filter((y) => y !== x)))} />{name[x]}</label>)}
        <a href={`/api/connect/google/start?s=${pick.join(",")}`} className={`rounded-lg bg-ink text-on-ink px-3 py-1 ${pick.length ? "" : "pointer-events-none opacity-40"}`} data-testid="google-connect-go">{s.connected?.services.length ? t("Change") : t("Connect Google")}</a>
      </div>
    </section>
  );
}

// «Telegram» (lib/telegram.ts): one official Unchore bot; a one-time link ties the member's own chat to Unchore.
// «Your computers» (lib/computers.ts): connect your own computer or server, and pick «🖥 <name>» as the AI of a chat or project.
// Hidden until UNCHORE_COMPUTERS opens it for the member (owner first).
function ComputersConnect() {
  const t = useT();
  type Row = { id: string; name: string; online: boolean; last_seen_at: string | null; info: { host?: string; claude?: string; dir?: string; engine?: string } };
  const [s, setS] = useState<{ available: boolean; computers: Row[] } | null>(null);
  const [name, setName] = useState("");
  const [cmd, setCmd] = useState("");
  const [copied, setCopied] = useState(false);
  const load = () => { fetch("/api/computers").then((r) => (r.ok ? r.json() : null)).then(setS).catch(() => {}); };
  useEffect(load, []);
  useEffect(() => { if (!cmd) return; const id = setInterval(load, 5000); return () => clearInterval(id); }, [cmd]);
  if (!s?.available) return null;
  const add = async () => {
    const r = await fetch("/api/computers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: name.trim() || t("My computer") }) }).then((x) => x.json()).catch(() => null) as { command?: string } | null;
    if (r?.command) { setCmd(r.command); setName(""); setCopied(false); load(); }
  };
  return (
    <section className="flex flex-col gap-3" data-testid="computers">
      <h2 className="font-semibold">🖥 {t("Your computers")}</h2>
      <p className="text-sm text-fg-2">{t("Connect your own computer or server. Then pick it as the AI of a chat or project: it answers with its own Claude Code, Codex or Hermes Agent — your files, your programs, your sign-in. It calls Unchore; nothing can get into it from outside.")}</p>
      {s.computers.map((c) => (
        <div key={c.id} className="flex flex-wrap items-center gap-2 text-sm border-t border-line-soft pt-2">
          <span className={`inline-block w-2 h-2 rounded-full ${c.online ? "bg-green-600" : "bg-line-2"}`} aria-hidden />
          <b>{c.name}</b>
          <span className="text-xs text-muted">{c.online ? t("on") : t("off")}{c.info?.engine ? ` · ${({ claude: "Claude Code", codex: "Codex", hermes: "Hermes Agent" } as Record<string, string>)[String(c.info.engine)] ?? ""}` : ""}{c.info?.host ? ` · ${c.info.host}` : ""}{c.info?.dir ? ` · ${c.info.dir}` : ""}</span>
          <button type="button" onClick={async () => { if (!confirm(`${t("Disconnect")}: ${c.name}?`)) return; await fetch(`/api/computers?id=${c.id}`, { method: "DELETE" }); load(); }} className="ml-auto rounded-lg border border-line px-2 py-0.5 text-xs hover:bg-hover">{t("Disconnect")}</button>
        </div>
      ))}
      {cmd ? (
        <div className="flex flex-col gap-2 text-sm">
          <div>{t("On that computer, open a terminal in the folder it should work in, and paste this (Node 18+ and Claude Code, Codex or Hermes Agent signed in):")}</div>
          <code className="block break-all rounded-lg bg-page border border-line p-2 text-xs">{cmd}</code>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => { void navigator.clipboard?.writeText(cmd).then(() => setCopied(true)); }} className="rounded-lg bg-ink text-on-ink px-3 py-1">{copied ? `✓ ${t("Copied")}` : t("Copy")}</button>
            <span className="text-xs text-fg-2">{t("This command is shown once. Add «--full» at the end to let it act without asking (a chat can't answer its questions).")}</span>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Name, e.g. Office server")} maxLength={40} className="rounded-lg border border-line bg-page px-3 py-1.5 flex-1 min-w-0" />
          <button type="button" onClick={add} className="rounded-lg bg-ink text-on-ink px-3 py-1.5" data-testid="computer-add">{t("Connect a computer")}</button>
        </div>
      )}
    </section>
  );
}

// «MCP servers» (lib/mcp-client.ts — like `claude mcp add`): tools from services the member connects, used in their chats.
function McpServers() {
  const t = useT();
  type Row = { id: string; slug: string; host: string; tools: string[]; ok: boolean; error: string | null };
  const [rows, setRows] = useState<Row[]>([]);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [msg, setMsg] = useState(() => (typeof location === "undefined" ? "" : new URLSearchParams(location.search).get("mcp_error") ?? ""));
  const load = () => { fetch("/api/mcp").then((r) => (r.ok ? r.json() : [])).then(setRows).catch(() => {}); };
  useEffect(load, []);
  const add = async () => {
    setMsg(t("Checking…"));
    const j = await fetch("/api/mcp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: name.trim(), url: url.trim(), secret: secret.trim() || undefined }) }).then((r) => r.json()).catch(() => null) as { ok?: boolean; text?: string } | null;
    setMsg(j?.ok ? `✓ ${t("Connected")}` : j?.text ?? t("Couldn't add it."));
    if (j?.ok) { setName(""); setUrl(""); setSecret(""); }
    load();
  };
  return (
    <section className="flex flex-col gap-3" data-testid="mcp-servers">
      <h2 className="font-semibold">🔌 {t("MCP servers")}</h2>
      <p className="text-sm text-fg-2">{t("Connect a service's MCP server (Notion, Linear, Sentry, Zapier or your own) and the AI can use its tools in your chats, signed in as you. Tools that change something ask you first. You can also just tell the AI in a chat.")}</p>
      {rows.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center gap-2 text-sm border-t border-line-soft pt-2" data-testid="mcp-row">
          <span className={`inline-block w-2 h-2 rounded-full ${r.ok ? "bg-green-600" : "bg-line-2"}`} aria-hidden />
          <b>{r.slug}</b>
          <span className="text-xs text-muted">{r.host}{r.tools.length ? ` · ${t("{n} tools", { n: r.tools.length })}` : r.error && !/sign in/.test(r.error) ? ` · ${r.error}` : ""}</span>
          {!r.ok && <a href={`/api/connect/mcp/start?id=${r.id}`} className="rounded-lg bg-ink text-on-ink px-2 py-0.5 text-xs">{t("Sign in")}</a>}
          <button type="button" onClick={async () => { await fetch("/api/mcp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ refresh: r.id }) }); load(); }} className="ml-auto rounded-lg border border-line px-2 py-0.5 text-xs hover:bg-hover">{t("Check again")}</button>
          <button type="button" onClick={async () => { if (!confirm(`${t("Disconnect")}: ${r.slug}?`)) return; await fetch(`/api/mcp?slug=${r.slug}`, { method: "DELETE" }); load(); }} className="rounded-lg border border-line px-2 py-0.5 text-xs hover:bg-hover">{t("Disconnect")}</button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Name, e.g. notion")} maxLength={40} className="rounded-lg border border-line bg-page px-3 py-1.5 w-32" />
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://mcp.example.com/mcp" maxLength={500} className="rounded-lg border border-line bg-page px-3 py-1.5 flex-1 min-w-0" />
        <input value={secret} onChange={(e) => setSecret(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))} placeholder={t("Saved key name (optional)")} maxLength={60} className="rounded-lg border border-line bg-page px-3 py-1.5 w-44" />
        <button type="button" onClick={add} disabled={!name.trim() || !url.trim()} className="rounded-lg bg-ink text-on-ink px-3 py-1.5 disabled:opacity-40" data-testid="mcp-add">{t("Connect")}</button>
      </div>
      {msg && <p className="text-xs text-fg-2" role="status">{msg}</p>}
    </section>
  );
}

// «Slack» and «Discord» (lib/chat-apps.ts): the member's own app there; the pairing code proves it's them, once.
function ChatAppsConnect() {
  const t = useT();
  type One = { ready: boolean; paired: boolean; code: string | null; url: string };
  const [s, setS] = useState<{ slack: One; discord: One } | null>(null);
  const [f, setF] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [install, setInstall] = useState("");
  const load = () => { fetch("/api/settings/chat-apps").then((r) => (r.ok ? r.json() : null)).then(setS).catch(() => {}); };
  useEffect(load, []);
  useEffect(() => { if (!s || ((!s.slack.ready || s.slack.paired) && (!s.discord.ready || s.discord.paired))) return; const id = setInterval(load, 5000); return () => clearInterval(id); }, [s]);
  if (!s) return null;
  const post = async (k: string, body: Record<string, string>) => {
    setMsg((m) => ({ ...m, [k]: t("Checking…") }));
    const j = await fetch("/api/settings/chat-apps", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => null) as { ok?: boolean; text?: string; url?: string; install?: string } | null;
    if (j?.url) { window.open(j.url, "_blank"); setMsg((m) => ({ ...m, [k]: "" })); load(); return; }
    setMsg((m) => ({ ...m, [k]: j?.ok ? `✓ ${t("Saved")}` : j?.text ?? t("Couldn't add it.") }));
    if (j?.install) setInstall(j.install);
    if (j?.ok) { setF({}); load(); }
  };
  const field = (k: string, ph: string, secret = false) => <input key={k} value={f[k] ?? ""} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} placeholder={ph} type={secret ? "password" : "text"} autoComplete="off" className="rounded-lg border border-line bg-page px-3 py-1.5 flex-1 min-w-[10rem]" />;
  const pairLine = (one: One, how: string) => one.ready && !one.paired && one.code ? <p className="text-sm">{how} <code className="rounded bg-page border border-line px-1">{one.code}</code></p> : null;
  const off = (k: "slack" | "discord") => <button type="button" onClick={async () => { if (!confirm(`${t("Disconnect")}?`)) return; await fetch(`/api/settings/chat-apps?kind=${k}`, { method: "DELETE" }); load(); }} className="rounded-lg border border-line px-2 py-0.5 text-xs hover:bg-hover">{t("Disconnect")}</button>;
  return (
    <section className="flex flex-col gap-4" data-testid="chat-apps">
      <div className="flex flex-col gap-2">
        <h2 className="font-semibold">Slack</h2>
        <p className="text-sm text-fg-2">{t("Talk to Unchore in your own Slack: send it a direct message or @mention it. It uses your own Slack app — nothing is shared with anyone else.")}</p>
        {s.slack.paired ? <div className="flex items-center gap-2 text-sm"><span className="flex-1">✓ {t("Connected")}</span>{off("slack")}</div> : (<>
          <p className="text-sm">1. <button type="button" onClick={() => void post("slack", { step: "slack-start" })} className="rounded-lg bg-ink text-on-ink px-3 py-1" data-testid="slack-start">{t("Create the Slack app")}</button> <span className="text-xs text-fg-2">{t("Slack opens with everything filled in: pick your workspace → Create → Install to Workspace.")}</span></p>
          <p className="text-sm">2. {t("Paste the Bot User OAuth Token (OAuth & Permissions) and the Signing Secret (Basic Information):")}</p>
          <div className="flex flex-wrap gap-2 text-sm">{field("st", "xoxb-…", true)}{field("ss", t("Signing Secret"), true)}
            <button type="button" disabled={!f.st || !f.ss} onClick={() => void post("slack", { step: "slack-save", token: f.st!, signing: f.ss! })} className="rounded-lg bg-ink text-on-ink px-3 py-1.5 disabled:opacity-40">{t("Save")}</button></div>
          {pairLine(s.slack, t("3. In Slack, send the app this code once:"))}
          {s.slack.ready && off("slack")}
        </>)}
        {msg.slack && <p className="text-xs text-fg-2" role="status">{msg.slack}</p>}
      </div>
      <div className="flex flex-col gap-2 border-t border-line-soft pt-3">
        <h2 className="font-semibold">Discord</h2>
        <p className="text-sm text-fg-2">{t("Use /ask in Discord — in any server or DM. Only you see the answer.")}</p>
        {s.discord.paired ? <div className="flex items-center gap-2 text-sm"><span className="flex-1">✓ {t("Connected")}</span>{off("discord")}</div> : (<>
          <p className="text-sm">1. <a href="https://discord.com/developers/applications" target="_blank" rel="noreferrer" className="underline">{t("Make an application on Discord's developer page")}</a> <span className="text-xs text-fg-2">{t("(New Application → any name). Then copy three values:")}</span></p>
          <div className="flex flex-wrap gap-2 text-sm">{field("da", t("Application ID"))}{field("dp", t("Public Key"))}{field("dt", t("Bot token (Bot → Reset Token)"), true)}
            <button type="button" disabled={!f.da || !f.dp || !f.dt} onClick={() => void post("discord", { step: "discord-save", appId: f.da!, publicKey: f.dp!, token: f.dt! })} className="rounded-lg bg-ink text-on-ink px-3 py-1.5 disabled:opacity-40">{t("Save")}</button></div>
          {install && <p className="text-sm">2. <a href={install} target="_blank" rel="noreferrer" className="rounded-lg bg-ink text-on-ink px-3 py-1">{t("Add it to my Discord")}</a></p>}
          {pairLine(s.discord, t("3. In Discord, type /ask and this code once:"))}
          {s.discord.ready && off("discord")}
        </>)}
        {msg.discord && <p className="text-xs text-fg-2" role="status">{msg.discord}</p>}
      </div>
      <p className="text-xs text-subtle">{t("WhatsApp and Signal: connect your own computer above and run Hermes Agent's messaging gateway there.")}</p>
    </section>
  );
}

// «Alerts in» (lib/inbox-hooks.ts): an address the member's own shop, server or automation tool sends messages to.
function InboxHooks() {
  const t = useT();
  type Hook = { id: string; name: string; hint: string; conversation_id: string | null; enabled: boolean; per_hour: number; last_at: string | null; url: string };
  const [hooks, setHooks] = useState<Hook[] | null>(null);
  const [chats, setChats] = useState<{ id: string; title: string }[]>([]);
  const [name, setName] = useState("");
  const [to, setTo] = useState("");
  const [shown, setShown] = useState<{ id: string | null; url: string } | null>(null);
  const [msg, setMsg] = useState("");
  const load = () => { fetch("/api/settings/inbox").then((r) => (r.ok ? r.json() : null)).then((j) => setHooks(j ?? [])).catch(() => {}); };
  useEffect(() => { load(); fetch("/api/conversations").then((r) => (r.ok ? r.json() : [])).then((j: { id: string; title: string }[]) => setChats(j.slice(0, 50))).catch(() => {}); }, []);
  if (!hooks) return null;
  const post = async (body: Record<string, unknown>) => fetch("/api/settings/inbox", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => null) as Promise<{ ok?: boolean; url?: string } | null>;
  const add = async () => {
    const j = await post({ step: "create", name, conversation_id: to || null });
    if (j?.url) { setShown({ id: null, url: j.url }); setName(""); setMsg(""); load(); } else setMsg(t("Couldn't add it."));
  };
  const rekey = async (id: string) => {
    if (!confirm(t("Make a new key? The old address stops working at once."))) return;
    const j = await post({ step: "rekey", id });
    if (j?.url) setShown({ id, url: j.url });
  };
  const change = async (id: string, p: Record<string, unknown>) => { await post({ step: "update", id, ...p }); load(); };
  const chatSelect = (value: string, onChange: (v: string) => void) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-lg border border-line bg-page px-2 py-1.5 max-w-[14rem]">
      <option value="">{t("A new chat")}</option>
      {chats.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
    </select>
  );
  const urlBox = shown && (
    <div className="flex flex-col gap-1 rounded-lg border border-line bg-page p-2 text-xs">
      <span>{t("Copy this address now — the key is shown only once:")}</span>
      <code className="break-all select-all">{shown.url}</code>
      <span className="text-fg-2">{t("Send a POST with JSON {\"text\": \"…\"} or plain text. The key can also go in the x-inbox-key header instead of the address.")}</span>
    </div>
  );
  return (
    <section className="flex flex-col gap-3" data-testid="alerts-in">
      <h2 className="font-semibold">{t("Alerts in")}</h2>
      <p className="text-sm text-fg-2">{t("Give your own shop, server or automation tool an address. What it sends shows up in the chat you pick, and you get a notification. No AI runs on it.")}</p>
      {hooks.map((h) => (
        <div key={h.id} className="flex flex-col gap-1 border-t border-line-soft pt-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex-1 font-medium">{h.name} <span className="text-xs text-subtle">{h.hint}</span></span>
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={h.enabled} onChange={(e) => void change(h.id, { enabled: e.target.checked })} />{t("On")}</label>
            <button type="button" onClick={() => void rekey(h.id)} className="rounded-lg border border-line px-2 py-0.5 text-xs hover:bg-hover">{t("New key")}</button>
            <button type="button" onClick={async () => { if (!confirm(t("Delete this address? The chat and the alerts in it stay."))) return; await fetch(`/api/settings/inbox?id=${h.id}`, { method: "DELETE" }); load(); }} className="rounded-lg border border-line px-2 py-0.5 text-xs hover:bg-hover">{t("Delete")}</button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-fg-2">
            <span>{t("Goes to")}</span>{chatSelect(h.conversation_id ?? "", (v) => void change(h.id, { conversation_id: v || null }))}
            <span>{t("At most")}</span>
            <input type="number" min={1} max={600} defaultValue={h.per_hour} onBlur={(e) => { const n = Number(e.target.value); if (Number.isInteger(n) && n >= 1 && n <= 600 && n !== h.per_hour) void change(h.id, { per_hour: n }); }} className="w-16 rounded-lg border border-line bg-page px-2 py-1" />
            <span>{t("an hour")}</span>
          </div>
          {shown?.id === h.id && urlBox}
        </div>
      ))}
      {shown?.id === null && urlBox}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Name (e.g. My shop)")} maxLength={60} className="rounded-lg border border-line bg-page px-3 py-1.5 flex-1 min-w-[10rem]" />
        {chatSelect(to, setTo)}
        <button type="button" onClick={() => void add()} disabled={!name.trim()} className="rounded-lg bg-ink text-on-ink px-3 py-1.5 disabled:opacity-40" data-testid="alerts-in-add">{t("Make an address")}</button>
      </div>
      {msg && <p className="text-xs text-fg-2" role="status">{msg}</p>}
    </section>
  );
}

function TelegramConnect() {
  const t = useT();
  const [s, setS] = useState<{ available: boolean; linked?: boolean } | null>(null);
  const load = () => { fetch("/api/settings/telegram").then((r) => (r.ok ? r.json() : null)).then(setS).catch(() => {}); };
  useEffect(load, []);
  useEffect(() => { if (!s?.available || s.linked) return; const id = setInterval(load, 5000); return () => clearInterval(id); }, [s?.available, s?.linked]);
  if (!s?.available) return null;
  const go = async () => {
    const w = window.open("", "_blank");
    const r = await fetch("/api/settings/telegram", { method: "POST" }).then((x) => (x.ok ? x.json() : null)).catch(() => null) as { url?: string } | null;
    if (r?.url) { if (w) w.location.href = r.url; else location.href = r.url; } else w?.close();
  };
  return (
    <section className="flex flex-col gap-3" data-testid="telegram-connect">
      <h2 className="font-semibold">Telegram</h2>
      <p className="text-sm text-fg-2">{t("Write to Unchore from Telegram, and get your reminders there. It keeps working even when your computer is off.")}</p>
      {s.linked ? (
        <div className="flex flex-wrap items-center gap-2 text-sm"><span className="flex-1">✓ {t("Connected")}</span>
          <button type="button" onClick={async () => { await fetch("/api/settings/telegram", { method: "DELETE" }); load(); }} className="rounded-lg border border-line px-2 py-0.5 text-xs hover:bg-hover">{t("Disconnect")}</button></div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <button type="button" onClick={go} className="rounded-lg bg-ink text-on-ink px-3 py-1" data-testid="telegram-connect-go">{t("Connect Telegram")}</button>
          <span className="text-xs text-fg-2">{t("Telegram opens — press «Start». That's all.")}</span>
        </div>
      )}
    </section>
  );
}

function PushToggle() {
  const t = useT();
  const [state, setState] = useState<"off" | "on" | "busy" | "blocked" | "none">("off");
  const [devices, setDevices] = useState(0);
  useEffect(() => {
    fetch("/api/push").then((r) => r.json()).then((j: { publicKey: string | null; devices: number }) => {
      setDevices(j.devices);
      if (!j.publicKey || !("serviceWorker" in navigator) || !("PushManager" in window)) { setState("none"); return; }
      if (Notification.permission === "denied") { setState("blocked"); return; }
      navigator.serviceWorker.getRegistration("/sw.js").then((reg) => reg?.pushManager.getSubscription()).then((s) => setState(s ? "on" : "off")).catch(() => {});
    }).catch(() => setState("none"));
  }, []);
  const [asking, setAsking] = useState(false);   // the browser's Allow box is open
  async function turnOn() {
    setState("busy"); setAsking(allowBoxOpens());
    const st = await enablePush();
    setAsking(false);   // components/push-client.ts (also used by the chat's «thinking» line)
    if (st !== "on") { setState(st); return; }
    await fetch("/api/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ test: true }) }).catch(() => {});
    setState("on"); setDevices((n) => n + 1);
  }
  async function turnOff() {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) { await fetch("/api/push", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }); await sub.unsubscribe(); }
    setState("off");
  }
  const label = t("Notifications on this device (reminders, automation results)");
  if (state === "none") return <div className="flex flex-col gap-0.5 text-sm text-muted">{label}<span className="text-xs">{t("Not supported here (on iPhone, add to Home Screen first)")}</span></div>;
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
      <span>{label}{devices ? <span className="text-muted"> · {t("{devices} device(s)", { devices })}</span> : null}</span>
      {state === "blocked" ? <span className="text-muted">{t("Blocked in browser settings")}</span>
        : <input type="checkbox" disabled={state === "busy"} checked={state === "on"} onChange={(e) => (e.target.checked ? turnOn() : turnOff())} />}
      {asking && <span className="basis-full text-xs font-medium" role="status" data-testid="push-allow-hint">👆 {t("Click «Allow» in the box your browser just opened (top left on a computer).")}</span>}
    </div>
  );
}

/** «Asia/Seoul» → «서울 · 지금 오후 3:05 (GMT+9)» — the raw zone name alone means little to most people. */
function tzLabel(tz: string, lang: Lang, t: TFn): string {
  try {
    const now = new Date().toLocaleTimeString(lang, { timeZone: tz, hour: "numeric", minute: "2-digit", timeZoneName: "shortOffset" });
    const city = tz.split("/").pop()!.replace(/_/g, " ");
    const kr: Record<string, string> = { Seoul: "서울", Tokyo: "도쿄", "New York": "뉴욕", "Los Angeles": "로스앤젤레스", London: "런던", Paris: "파리", Berlin: "베를린", Singapore: "싱가포르", Shanghai: "상하이", Sydney: "시드니", UTC: "세계 표준시" };
    // Other languages: the zone's own name in that language («heure normale du Japon»), from the browser's calendar data.
    const named = lang === "ko" ? kr[city] ?? city : lang === "en" ? city : new Intl.DateTimeFormat(lang, { timeZone: tz, timeZoneName: "longGeneric" }).formatToParts(0).find((p) => p.type === "timeZoneName")?.value ?? city;
    return `${named} · ${t("now")} ${now}`;
  } catch { return tz; }
}

/** Import errors in plain words (codes from lib/importer.ts readExportFile and app/api/import). */
type ImportReply = { imported?: number; skipped?: number; more?: number; error?: string };
/** An export over 4 MB (up to 50 MB) goes up in 3.5 MB pieces (app/api/files/upload), then app/api/import puts it together. */
async function sendImport(f: File): Promise<{ ok: boolean; j: ImportReply }> {
  const reply = async (r: Response | null) => ({ ok: !!r?.ok, j: (r ? await r.json().catch(() => ({})) : {}) as ImportReply });
  if (f.size <= 4 * 1024 * 1024) { const fd = new FormData(); fd.append("file", f); return reply(await fetch("/api/import", { method: "POST", body: fd }).catch(() => null)); }
  if (f.size > ONE_ROW_MAX) return { ok: false, j: { error: "too_big" } };
  const s = await fetch("/api/files/upload", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: f.name, mime: f.type, size: f.size }) }).then((r) => r.json()).catch(() => null) as { id?: string; parts?: number } | null;
  if (!s?.id || !s.parts) return { ok: false, j: {} };
  for (let i = 0; i < s.parts; i++) {
    let ok = false;
    for (let tries = 0; tries < 6 && !ok; tries++) {
      ok = await fetch(`/api/files/upload?id=${s.id}&i=${i}`, { method: "PUT", body: f.slice(i * PART_BYTES, (i + 1) * PART_BYTES) }).then((r) => r.ok).catch(() => false);
      if (!ok) await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** tries, 15_000)));
    }
    if (!ok) return { ok: false, j: { error: "incomplete" } };
  }
  return reply(await fetch("/api/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ upload: s.id }) }).catch(() => null));
}

function importError(code: string | undefined, t: TFn): string {
  const m: Record<string, string> = {
    not_zip_export: k("No conversations.json inside this ZIP. Please use the export file from ChatGPT or Claude."),
    not_json: k("This doesn't read as a chat export. Please upload the export ZIP or conversations.json."),
    too_big: k("Too big. Up to 50 MB — the export ZIP as downloaded is much smaller."),
    incomplete: k("The upload was cut off. Please try again."),
  };
  return t((code && m[code]) || "Couldn't import. Please try again shortly.");
}

/** A secret box with 👁 to check what was typed (AI Soul components/SecretSettings.tsx). Saved values are never shown again. */
function SecretInput({ value, onChange, placeholder, className, wrap, autoComplete }: { value: string; onChange: (v: string) => void; placeholder: string; className: string; wrap: string; autoComplete: string }) {
  const t = useT();
  const [eye, setEye] = useState(false);
  return (
    <div className={`relative ${wrap}`}>
      <input type={eye ? "text" : "password"} autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={`${className} pr-9`} />
      <button type="button" onClick={() => setEye((x) => !x)} aria-label={eye ? (t("Hide what I typed")) : (t("Show what I typed"))} aria-pressed={eye} className="absolute right-2 top-1/2 -translate-y-1/2 text-subtle text-sm">{eye ? "🙈" : "👁"}</button>
    </div>
  );
}
