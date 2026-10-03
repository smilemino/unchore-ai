"use client";
// Connect an AI inside the chat (owner 2026-09-30: «beginners give up at the Settings page»). Nothing here is saved as a chat message
// and nothing here reaches the AI: pasted keys and Claude's one-time code go straight to our own save routes.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { k, type TFn } from "@/lib/i18n";
import { useT } from "./I18n";
import { KEY_NAME, connectWhich, detectKey, looksLikeClaudeCode, looksLikeKey, maskSecret, wantsConnect, type KeyProvider } from "@/lib/chat-setup";

type Kind = "hello" | "more" | "plan" | "gpt" | "key" | "none" | "text";
/** `at` = how many chat messages were on screen when it appeared: 0 → shown above the chat, more → under it (a key pasted mid-chat). */
type Bubble = { role: "user" | "assistant"; kind: Kind; text?: string; at?: number };

// A started Claude sign-in waits 15 minutes on the worker (worker/claude.mjs). Remember it outside this screen: a phone often
// reloads this tab while they are in Claude's window, and the code they paste must still go to Claude, not to the AI.
const PLAN_KEY = "uc-claude-login";
const planStarted = () => { try { return Date.now() - Number(localStorage.getItem(PLAN_KEY) ?? 0) < 15 * 60_000; } catch { return false; } };
const planMark = (on: boolean) => { try { if (on) localStorage.setItem(PLAN_KEY, String(Date.now())); else localStorage.removeItem(PLAN_KEY); } catch { /* private mode */ } };

/** English is also the translation key; `words(t)` gives them in the screen's language. */
const W = {
  hello: k("Connect one AI first — it takes a minute.\n\nUnchore answers with the AI you already use (Claude, ChatGPT…). Tap the one that fits."),
  more: k("Which AI do you want to connect? Tap the one you use — it takes a minute."),
  pickPlan: k("I pay for Claude (Pro · Max)"),
  pickGpt: k("I pay for ChatGPT (Plus · Pro)"),
  pickKey: k("I have an API key"),
  pickNone: k("I have none · not sure"),
  plan: k("Great — three taps.\n\n1. Tap «Open Claude sign-in». A new window opens.\n2. Sign in to Claude and press the orange «Authorize». A long code and a «Copy Code» button appear — press it.\n3. Come back and paste it in the box at the bottom, then press ↑.\n\nYour Claude password only goes into Claude's own window. Unchore never sees it, and there's no extra cost."),
  open: k("Open Claude sign-in ↗"),
  opening: k("Opening…"),
  openAgain: k("Didn't open? Tap here ↗"),
  copyLink: k("Copy link"),
  linkCopied: k("Copied — paste it into the address bar"),
  phoneTip: k("On a phone, did the Claude app open, or did the window close by itself? Tap «Copy link», open Chrome (on iPhone, Safari), paste it into the address bar at the top and go. Sign in there, then bring the code back here."),
  gpt: k("Great — two steps.\n\n1. Tap the button below. It copies your code and opens ChatGPT's sign-in.\n2. Sign in to ChatGPT and paste the code there.\n\nThat's all — I'll notice by myself when you're done. Your ChatGPT password only goes into OpenAI's own window. Unchore never sees it, and there's no extra cost."),
  gptOpen: k("Copy code and open ChatGPT ↗"),
  gptGetting: k("Getting your code…"),
  gptCopied: k("Copied. Paste it on ChatGPT's page — I'm waiting here."),
  gptDown: k("ChatGPT's sign-in isn't answering right now. Please try again in a minute or two."),
  gptExpired: k("The sign-in wasn't finished in time. Tap «I pay for ChatGPT» again for a new code."),
  phGpt: k("Finish on ChatGPT's page — I'll notice by myself"),
  key: k("Paste your API key in the box at the bottom and press ↑.\n\nClaude, ChatGPT, Gemini, Grok, DeepSeek, Kimi and OpenRouter keys all work — I'll tell which company it's from. Keys are stored encrypted and never go into the chat or to the AI."),
  none: k("No problem. The easiest way is a Claude subscription.\n\n1. Subscribe to Pro at [claude.ai](https://claude.ai/upgrade) (the price is shown there).\n2. Come back and tap «I pay for Claude».\n\nPrefer paying per use? Make a key at [OpenRouter](https://openrouter.ai/keys) and paste it here — one key, many AIs."),
  back: k("Start over"),
  held: k("I'll keep your question and answer it as soon as an AI is connected."),
  checking: k("Checking… (up to a minute)"),
  keyBad: k("That key doesn't get an answer from the AI. Check you copied all of it and paste again. (A key with no credit does this too.)"),
  codeBad: k("That code didn't work or has expired. Tap «Open Claude sign-in» again for a new one."),
  down: k("Claude's connection server isn't answering right now. Please try again in a minute or two."),
  net: k("The connection dropped for a moment. Please send it again."),
  needCode: k("Paste the code from Claude's window. Haven't opened it yet? Tap «Open Claude sign-in» above first."),
  phPlan: k("Paste the code Claude showed you here"),
  phKey: k("Paste your key here"),
  phNone: k("You can type your question now"),
} as const;
const words = (t: TFn) => ({
  ...(Object.fromEntries(Object.entries(W).map(([k, v]) => [k, t(v)])) as Record<keyof typeof W, string>),
  ok: (name: string) => t("✅ {name} connected! Ask me anything.", { name }),
  keyOk: (name: string, mask: string) => t("🔑 Saved your {name} key ({mask}). It didn't go into the chat or to the AI.", { name, mask }),
});

/** The chat's setup helper. `handle` takes a message first: true = it was a key, a code or a no-AI-yet question (don't send it to the AI). */
export function useSetup(hasKey: boolean, resend: (q: string) => void, count: number) {
  const t = useT();
  const w = useMemo(() => words(t), [t]);
  const router = useRouter();
  const [connected, setConnected] = useState(hasKey);
  const [bubbles, setBubbles] = useState<Bubble[]>(hasKey ? [] : [{ role: "assistant", kind: "hello" }]);
  const [stage, setStage] = useState<"hello" | "plan" | "gpt" | "key" | "none">("hello");
  const [gpt, setGpt] = useState<{ url: string; code: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const pending = useRef<string | null>(null);
  const live = useRef(hasKey);   // read by a question that was held back and re-sent from an older render
  const resendRef = useRef(resend);
  const countRef = useRef(count);
  if (hasKey && !connected) setConnected(true);   // the server says so (e.g. after a refresh)

  const add = (...b: Bubble[]) => setBubbles((x) => [...x, ...b.map((y) => ({ at: countRef.current, ...y }))]);
  const say = (text: string) => add({ role: "assistant", kind: "text", text });
  function choose(k: "plan" | "gpt" | "key" | "none", label: string) {
    setStage(k); add({ role: "user", kind: "text", text: label }, { role: "assistant", kind: k });
    if (k === "gpt") void startGpt();
  }
  function done(line: string) {
    say(line); live.current = true; setConnected(true); setStage("hello"); router.refresh();
    const q = pending.current; pending.current = null;
    if (q) setTimeout(() => resendRef.current(q), 400);
  }

  async function openPlan() {
    const win = window.open("about:blank", "_blank");   // opened inside the tap, or phones block it
    setOpening(true);
    const r = await fetch("/api/settings/claude", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ step: "start" }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setOpening(false);
    if (!r?.ok || !j.url) { win?.close(); say(w.down); return; }
    setLink(j.url); setLinkCopied(false); planMark(true);
    if (win) win.location.href = j.url;
  }

  // ChatGPT plan (owner 2026-10-01): OpenAI's device sign-in. We fetch the code first, so one tap copies it and opens their page;
  // then this screen asks every 4 s until the worker says it's done — they never come back to type anything.
  async function startGpt() {
    setGpt(null); setCopied(false); setOpening(true);
    const r = await fetch("/api/settings/chatgpt", { method: "POST" }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setOpening(false);
    if (!r?.ok || !j.url || !j.code) { say(w.gptDown); setStage("hello"); add({ role: "assistant", kind: "hello" }); return; }
    setGpt({ url: j.url, code: j.code });
  }
  function openGpt() {
    if (!gpt) return;
    window.open(gpt.url, "_blank");
    void navigator.clipboard?.writeText(gpt.code).then(() => setCopied(true), () => setCopied(true));
  }
  const doneRef = useRef(done);
  useEffect(() => { doneRef.current = done; });
  useEffect(() => {
    if (!gpt) return;
    let stop = false, timer: ReturnType<typeof setTimeout> | undefined;
    const t0 = Date.now();
    const tick = async () => {
      if (stop) return;
      const r = await fetch("/api/settings/chatgpt").catch(() => null);
      const j = (r?.ok ? await r.json().catch(() => ({})) : {}) as { connected?: boolean; waiting?: boolean };
      if (stop) return;
      if (j.connected) { setGpt(null); doneRef.current(w.ok(t("ChatGPT plan"))); return; }
      if ((r?.ok && !j.waiting) || Date.now() - t0 > 16 * 60_000) { setGpt(null); setStage("hello"); add({ role: "assistant", kind: "text", text: w.gptExpired }, { role: "assistant", kind: "hello" }); return; }
      timer = setTimeout(tick, 4000);
    };
    timer = setTimeout(tick, 4000);
    return () => { stop = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gpt]);

  async function saveKey(k: { provider: KeyProvider | "auto"; key: string }) {
    add({ role: "user", kind: "text", text: `🔑 ${maskSecret(k.key)}` }, { role: "assistant", kind: "text", text: w.checking });
    const r = await fetch("/api/settings/keys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: k.provider, key: k.key }) }).catch(() => null);
    setBubbles((x) => x.slice(0, -1));
    if (!r) { say(w.net); return; }
    if (!r.ok) { say(w.keyBad); return; }
    const p = ((await r.json().catch(() => ({}))) as { provider?: KeyProvider }).provider ?? (k.provider === "auto" ? "openai" : k.provider);
    if (live.current) { say(w.keyOk(KEY_NAME[p], maskSecret(k.key))); setStage("hello"); router.refresh(); } else done(w.ok(KEY_NAME[p]));
  }

  async function finishPlan(code: string) {
    add({ role: "user", kind: "text", text: `🔐 ${maskSecret(code)}` }, { role: "assistant", kind: "text", text: w.checking });
    const r = await fetch("/api/settings/claude", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ step: "finish", code }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBubbles((x) => x.slice(0, -1));
    if (r?.ok) { setLink(null); planMark(false); done(w.ok(j.hint ? `${t("Claude plan")} (${j.hint})` : t("Claude plan"))); return; }
    say(!r || r.status >= 500 ? w.down : w.codeBad);
  }

  async function handleNow(q: string): Promise<boolean> {
    const k = detectKey(q) ?? (stage === "key" && looksLikeKey(q) ? { provider: "auto" as const, key: q.trim() } : null);
    if (k) { await saveKey(k); return true; }
    if ((stage === "plan" || link || planStarted()) && looksLikeClaudeCode(q)) { await finishPlan(q.trim()); return true; }
    if (live.current && (wantsConnect(q, t("connect Claude")) || wantsConnect(q, t("connect ChatGPT")))) {
      const which = connectWhich(q, t("connect ChatGPT"));
      choose(which === "chatgpt" ? "gpt" : which === "key" ? "key" : "plan", q);
      return true;
    }
    if (live.current) return false;   // the setup lines stay above the chat as a record («✅ connected»)
    add({ role: "user", kind: "text", text: q });
    if (stage === "plan") { say(w.needCode); return true; }
    if (stage === "gpt" && gpt) { say(w.phGpt); return true; }
    pending.current = q;
    add({ role: "assistant", kind: "text", text: w.held }, { role: "assistant", kind: "hello" });
    setStage("hello");
    return true;
  }

  const impl = useRef(handleNow);
  useEffect(() => { impl.current = handleNow; resendRef.current = resend; countRef.current = count; if (hasKey) live.current = true; });
  /** Another chat opened: start clean (the greeting again if nothing is connected yet). */
  const reset = useCallback(() => { setBubbles(live.current ? [] : [{ role: "assistant", kind: "hello", at: 0 }]); setStage("hello"); setLink(null); setGpt(null); }, []);
  const handle = useCallback((q: string) => impl.current(q), []);
  /** «＋ Connect my own AI» under the box (a member already answering on Unchore credit sees no greeting, 2026-10-01). */
  const showConnect = useCallback(() => { setStage("hello"); setGpt(null); setBubbles((x) => [...x, { role: "assistant", kind: "more", at: countRef.current }]); }, []);

  const placeholder = stage === "plan" ? w.phPlan : stage === "gpt" && gpt ? w.phGpt : stage === "key" ? w.phKey : connected ? null : w.phNone;
  const btn = "rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm hover:bg-hover text-left";
  const last = bubbles.length - 1;
  const row = (b: Bubble, i: number) => b.role === "user" ? (
        <div key={i} className="self-end max-w-[85%] rounded-2xl bg-bubble px-4 py-2 whitespace-pre-wrap break-words">{b.text}</div>
      ) : (
        <div key={i} className="max-w-full flex flex-col gap-3">
          <SetupText text={b.kind === "text" ? b.text ?? "" : w[b.kind]} />
          {(b.kind === "hello" || b.kind === "more") && i === last && (
            <div className="flex flex-wrap gap-2">
              <button className={btn} onClick={() => choose("plan", w.pickPlan)}>{w.pickPlan}</button>
              <button className={btn} onClick={() => choose("gpt", w.pickGpt)}>{w.pickGpt}</button>
              <button className={btn} onClick={() => choose("key", w.pickKey)}>{w.pickKey}</button>
              <button className={btn} onClick={() => choose("none", w.pickNone)}>{w.pickNone}</button>
            </div>
          )}
          {b.kind === "plan" && stage === "plan" && (
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => void openPlan()} disabled={opening} className="w-fit rounded-lg bg-ink text-on-ink px-4 py-2 text-sm disabled:opacity-50">{opening ? w.opening : w.open}</button>
              {link && <a href={link} target="_blank" rel="noreferrer" className="text-sm underline text-subtle">{w.openAgain}</a>}
              {link && <button onClick={() => void navigator.clipboard?.writeText(link).then(() => setLinkCopied(true), () => setLinkCopied(false))} className={btn} data-testid="claude-copy-link">{linkCopied ? w.linkCopied : w.copyLink}</button>}
            </div>
          )}
          {b.kind === "plan" && stage === "plan" && link && <p className="text-sm text-subtle leading-6">{w.phoneTip}</p>}
          {b.kind === "gpt" && stage === "gpt" && (
            <div className="flex flex-col gap-2" data-testid="gpt-connect">
              {!gpt ? <span className="text-sm text-subtle">{opening ? w.gptGetting : ""}</span> : (
                <>
                  <div className="w-fit rounded-lg border border-line bg-surface px-4 py-2 font-mono text-xl tracking-widest select-all" data-testid="gpt-code">{gpt.code}</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={openGpt} className="w-fit rounded-lg bg-ink text-on-ink px-4 py-2 text-sm">{w.gptOpen}</button>
                    <a href={gpt.url} target="_blank" rel="noreferrer" className="text-sm underline text-subtle">{w.openAgain}</a>
                  </div>
                  {copied && <span className="text-sm text-subtle">{w.gptCopied}</span>}
                </>
              )}
            </div>
          )}
          {(b.kind === "none" || b.kind === "key" || (b.kind === "gpt" && !gpt && !opening)) && i === last && <button className={`${btn} w-fit`} onClick={() => { setStage("hello"); add({ role: "assistant", kind: "hello" }); }}>{w.back}</button>}
        </div>
      );
  const pick = (above: boolean) => {
    const rows = bubbles.map((b, i) => (((b.at ?? 0) === 0) === above ? row(b, i) : null)).filter(Boolean);
    return rows.length ? <>{rows}</> : null;
  };
  return { before: pick(true), after: pick(false), handle, reset, showConnect, connected, placeholder };
}

/** Plain lines with numbered steps and [links](…) — the setup text is ours, so a tiny renderer is enough. */
function SetupText({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-2 leading-7">
      {text.split("\n\n").map((para, i) => (
        <p key={i} className="whitespace-pre-wrap">
          {para.split(/(\[[^\]]+\]\([^)]+\))/g).map((part, j) => {
            const m = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
            return m ? <a key={j} href={m[2]} target="_blank" rel="noreferrer" className="underline">{m[1]}</a> : <span key={j}>{part}</span>;
          })}
        </p>
      ))}
    </div>
  );
}
