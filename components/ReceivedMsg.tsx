"use client";
// «Received messages» (lib/msg-intake.ts): a shared or pasted message goes to one chat per sender, and the AI's reply draft
// opens in the member's own messaging app — Unchore never sends it.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "./I18n";
import { useStored } from "./useClient";
import { MSG_IN_KEY, MSG_SEEN_KEY, MSG_START_KEY, cleanFrom, fromLine, localDay, msgKey, phoneOf, readNewText, readReply, receivedQuestion, rememberMsg, sentDayProblem, smsHref } from "@/lib/msg-intake";

/** Under a new chat's box when it holds a shared or pasted message. onNew sends the question in this (new) chat. */
export function ReceivedBar({ text, onNew }: { text: string; onNew: (question: string) => void }) {
  const t = useT();
  const router = useRouter();
  const [on, setOn] = useStored(MSG_IN_KEY, "");
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [sent, setSent] = useState("");
  const [start, setStart] = useStored(MSG_START_KEY, "");
  const [seenRaw, setSeen] = useStored(MSG_SEEN_KEY, "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="self-start text-xs text-muted underline" data-testid="msg-in-open">📨 {t("Someone sent me this message")}</button>;
  if (on !== "on") return (
    <div className="rounded-lg border border-line bg-panel p-3 text-sm flex flex-col gap-2" data-testid="msg-in-notice">
      <div>{t("The AI will organize what the other person sent you — only share the messages you need.")}</div>
      <div className="flex gap-2">
        <button type="button" onClick={() => setOn("on")} className="rounded-lg bg-ink text-on-ink px-3 py-1" data-testid="msg-in-on">{t("Turn on")}</button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-line px-3 py-1">{t("Not now")}</button>
      </div>
    </div>
  );
  const go = async () => {
    const who = cleanFrom(from);
    if (!who || busy) return;
    const today = localDay(new Date());
    const bad = sentDayProblem(sent, start, today);
    if (bad) { setErr(bad === "future" ? t("That day hasn't come yet.") : bad === "need_day" ? t("Add the day it was sent — you chose to skip messages before {day}.", { day: start }) : t("Skipped: this message is from before {day}, the start day you chose.", { day: start })); return; }
    // The same message shared again (a retry, a second share) isn't organized twice.
    const key = msgKey(who, text, sent), seen = seenRaw ? seenRaw.split(",") : [];
    if (seen.includes(key)) { setErr(t("You already organized this message — it isn't added again.")); return; }
    setBusy(true); setErr("");
    const question = receivedQuestion(who, text, sent, today);
    // The same sender's chat, if there is one: the question waits in that chat's queue and is sent when it opens.
    const hits = await fetch(`/api/conversations?q=${encodeURIComponent(fromLine(who))}`).then((r) => (r.ok ? r.json() : [])).catch(() => []) as { id: string }[];
    const prev = hits[0]?.id;
    if (!prev) { setBusy(false); setSeen(rememberMsg(seen, key).join(",")); onNew(question); return; }
    const r = await fetch("/api/chat/queue", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ conversationId: prev, text: question }) }).catch(() => null);
    setBusy(false);
    if (r?.ok) { setSeen(rememberMsg(seen, key).join(",")); router.push(`/app?c=${prev}`); } else setErr(t("Couldn't do it — try again"));
  };
  return (
    <div className="rounded-lg border border-line bg-panel p-3 text-sm flex flex-wrap items-center gap-2" data-testid="msg-in-bar">
      <input value={from} onChange={(e) => setFrom(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void go(); }} maxLength={60}
        placeholder={t("Who sent it? (name or number)")} className="flex-1 min-w-40 rounded-md border border-line bg-transparent px-2 py-1" data-testid="msg-in-from" />
      <label className="flex items-center gap-1 text-xs text-muted">{t("Sent on (optional)")}
        <input type="date" value={sent} max={localDay(new Date())} onChange={(e) => setSent(e.target.value)} className="rounded-md border border-line bg-transparent px-1 py-0.5" data-testid="msg-in-sent" /></label>
      <label className="flex items-center gap-1 text-xs text-muted">{t("Skip messages sent before")}
        <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="rounded-md border border-line bg-transparent px-1 py-0.5" data-testid="msg-in-start" /></label>
      <button type="button" disabled={!from.trim() || busy} onClick={() => void go()} className="rounded-lg bg-ink text-on-ink px-3 py-1 disabled:opacity-40" data-testid="msg-in-go">{t("Organize")}</button>
      <button type="button" onClick={() => { setOn(""); setOpen(false); }} className="text-xs text-muted underline" data-testid="msg-in-off">{t("Turn off")}</button>
      {err && <span className="w-full text-xs text-red-600">{err}</span>}
    </div>
  );
}

/** The AI's reply draft: copy it, or open the member's own messaging app with it filled in (they press send there). */
export function ReplyCard({ content, from }: { content: string; from: string | null }) {
  const t = useT();
  const body = readReply(content);
  if (!body) return null;
  const apple = typeof navigator !== "undefined" && /iPhone|iPad|Macintosh/.test(navigator.userAgent);
  return (
    <div className="mt-2 rounded-xl border border-line bg-panel p-3 text-sm flex flex-col gap-2" data-testid="reply-card">
      <div className="font-medium">✉️ {from ? t("Reply draft to {name}", { name: from }) : t("Reply draft")}</div>
      <div className="whitespace-pre-wrap text-fg-2">{body}</div>
      <div className="flex flex-wrap items-center gap-2">
        <a href={smsHref(from ? phoneOf(from) : "", body, apple)} className="rounded-lg bg-ink text-on-ink px-3 py-1" data-testid="reply-open-sms">{t("Open in Messages")}</a>
        <button type="button" onClick={() => void navigator.clipboard?.writeText(body).catch(() => {})} className="rounded-lg border border-line px-3 py-1">{t("Copy")}</button>
      </div>
      <div className="text-xs text-muted">{t("Unchore doesn't send it — you check it and send it yourself.")}</div>
    </div>
  );
}

/** The AI's new-text box (lib/msg-intake.ts readNewText): the number and the words, and «Open in Messages» — the member's tap is the
 *  yes; their own app opens with both filled in and they press send. `received` = this chat was built from a received message: no card. */
export function NewTextCard({ content, received }: { content: string; received: boolean }) {
  const t = useT();
  const { box, err } = readNewText(content);
  if (received && (box || err)) return <div className="mt-2 text-xs text-muted" data-testid="new-text-blocked">{t("No new text from a chat about a received message — only a reply to its sender.")}</div>;
  if (err) return <div className="mt-2 text-xs text-muted" data-testid="new-text-err">{err === "not_mobile" ? t("No text card: the number doesn't look like a mobile number.") : t("No text card: the message was empty.")}</div>;
  if (!box) return null;
  const apple = typeof navigator !== "undefined" && /iPhone|iPad|Macintosh/.test(navigator.userAgent);
  return (
    <div className="mt-2 rounded-xl border border-line bg-panel p-3 text-sm flex flex-col gap-2" data-testid="new-text-card">
      <div className="font-medium">📱 {t("New text to {name}", { name: box.name ? `${box.name} (${box.to})` : box.to })}</div>
      <div className="whitespace-pre-wrap text-fg-2">{box.text}</div>
      <div className="flex flex-wrap items-center gap-2">
        <a href={smsHref(box.to, box.text, apple)} className="rounded-lg bg-ink text-on-ink px-3 py-1" data-testid="new-text-open">{t("Open in Messages")}</a>
        <button type="button" onClick={() => void navigator.clipboard?.writeText(box.text).catch(() => {})} className="rounded-lg border border-line px-3 py-1">{t("Copy")}</button>
      </div>
      <div className="text-xs text-muted">{t("Check the number and the words. Unchore doesn't send it — your Messages app opens and you press send.")}</div>
    </div>
  );
}
