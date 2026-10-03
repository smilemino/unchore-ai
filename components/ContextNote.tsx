"use client";
// The line above an answer when a long chat was summarized to keep going (ported from AI Soul components/ContextNote.tsx):
// «📝 Long chat: the first n messages are now summarized… · View summary» — pressing it opens the summary right there (read only).
import { useState } from "react";
import { useT } from "./I18n";

export default function ContextNote({ conversationId, summarized }: { conversationId: string | null | undefined; summarized: number }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState<{ text: string; ok: boolean } | null>(null);
  const toggle = async () => {
    const next = !open; setOpen(next);
    if (!next || body?.ok || !conversationId) return;   // a failed load is tried again on the next press
    setBody(null);
    const r = await fetch(`/api/conversations/${conversationId}/summary`).catch(() => null);
    const d = r && r.ok ? ((await r.json().catch(() => null)) as { text?: string | null } | null) : null;
    setBody(d ? { text: d.text || t("There is no summary yet."), ok: true } : { text: t("Couldn't load the summary. Try again in a moment."), ok: false });
  };
  return (
    <div className="mb-1 text-xs text-muted" data-testid="context-note">
      <button type="button" className="hover:underline text-left" aria-expanded={open} disabled={!conversationId} onClick={() => void toggle()} data-testid="context-summary-toggle">
        📝 {t("Long chat: the first {n} messages are now summarized so the AI can keep going", { n: String(summarized) })} · {open ? t("Hide") : t("View summary")}
      </button>
      {open && <div className="mt-1 max-h-80 overflow-y-auto whitespace-pre-wrap rounded border border-line-2 bg-surface px-2 py-1 leading-5" data-testid="context-summary-body">{body?.text ?? t("Loading…")}</div>}
    </div>
  );
}
