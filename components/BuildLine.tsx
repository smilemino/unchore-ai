"use client";
import { useEffect, useState } from "react";
import { MARK_ICON, buildLine, pollMs, type BuildLive } from "@/lib/build-live";
import { useT } from "./I18n";

// The «working» line above the input for an app build left running (AI Soul components/WindowBadge.tsx · lib/build-live.ts):
// 🔵 which step and for how long · 🟠 it couldn't be finished, with «Try again» (sends that line into the chat, as typing it would) · ✅ ready, with the link.
export default function BuildLine({ conversationId, version, sending, onSay }: {
  conversationId: string | null;
  version: string;                      // changes whenever the chat does — read again (a new build may have started)
  sending: boolean;
  onSay: (text: string) => void;
}) {
  const t = useT();
  const [got, setGot] = useState<{ conv: string; build: BuildLive | null; answeredAfter: string | null } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const mine = got && got.conv === conversationId ? got : null;   // another chat's build is never shown here
  const view = buildLine(mine?.build ?? null, now, mine?.answeredAfter ?? null);
  const every = pollMs(view);

  useEffect(() => {
    if (!conversationId) return;
    let alive = true;
    const x = setTimeout(() => void fetch(`/api/conversations/${conversationId}/build`).then((r) => (r.ok ? r.json() : null))
      .then((j: { build: BuildLive | null; answeredAfter: string | null } | null) => { if (alive && j) { setGot({ conv: conversationId, ...j }); setNow(Date.now()); } }).catch(() => {}), 0);
    return () => { alive = false; clearTimeout(x); };
  }, [conversationId, version, now]);
  // While it works: read again every few seconds (the effect above re-runs on `now`); otherwise only the minutes move, each 30 s
  useEffect(() => {
    if (!view) return;
    const i = setTimeout(() => setNow(Date.now()), every ?? 30_000);
    return () => clearTimeout(i);
  }, [view, every, now]);

  if (!conversationId || !view || !mine?.build) return null;
  const title = mine.build.title;
  const steps: Record<string, string> = {
    queued: t("Waiting to start"), start: t("Starting"), check: t("Checking the app"), browser: t("Trying each button"),
    deploy: t("Putting it online"), open: t("Opening it like a visitor"),
  };
  const what = view.step === "write" ? t("Writing the app (try {n} of {max})", { n: String(view.tries ?? 1), max: "3" }) : steps[view.step] ?? "";
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" data-testid="build-line" data-mark={view.mark}>
      <span className={`rounded-full px-2 py-0.5 min-w-0 max-w-full truncate ${view.mark === "done" ? "bg-pill" : "bg-warn-bg"}`} data-testid="build-line-text">
        {MARK_ICON[view.mark]} «{title}» · {view.mark === "working" ? `${what} · ${t("{n} min", { n: String(view.min) })}`
          : view.mark === "done" ? `${t("Ready")} · ${t("{n} min ago", { n: String(view.min) })}`
          : t("Couldn't be finished")}
      </span>
      {view.mark === "done" && mine.build.url ? <a href={mine.build.url} target="_blank" rel="noreferrer" className="underline shrink-0" data-testid="build-line-open">{t("Open")}</a> : null}
      {view.mark === "decision" ? <button type="button" disabled={sending} onClick={() => onSay(t("Build «{title}» again", { title }))} className="shrink-0 rounded-full border border-line px-3 py-0.5 hover:bg-hover-2 disabled:opacity-40" data-testid="build-line-retry">{t("Try again")}</button> : null}
    </div>
  );
}
