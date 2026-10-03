"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// «Deleted · Undo» bar instead of a confirm box (ported from AI Soul components/Undo.tsx, 2026-09-30 sync).
// AI Soul archives and restores; Unchore has no archive column, so the real delete waits 5 seconds and «Undo» cancels it.
// Closing the tab within those 5 seconds still deletes (sent with keepalive), so nothing lingers half-deleted.
export const UNDO_MS = 5000;

export function useDelayedDelete(run: (url: string) => void) {
  const [undo, setUndo] = useState<{ url: string; text: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string | null>(null);
  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const url = pending.current; pending.current = null;
    if (url) { void fetch(url, { method: "DELETE", keepalive: true }).finally(() => run(url)); }
    setUndo(null);
  }, [run]);
  const schedule = useCallback((url: string, text: string) => {
    if (pending.current) flush();   // a second delete sends the first one right away
    pending.current = url;
    setUndo({ url, text });
    timer.current = setTimeout(flush, UNDO_MS);
  }, [flush]);
  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null; pending.current = null; setUndo(null);
  }, []);
  useEffect(() => {
    const onHide = () => { if (pending.current) flush(); };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [flush]);
  return { undo, schedule, cancel };
}

export function UndoBar({ text, label, onUndo }: { text: string; label: string; onUndo: () => void }) {
  return (
    <div className="fixed bottom-36 left-1/2 -translate-x-1/2 z-50 rounded-lg bg-ink text-on-ink px-3 py-2 text-sm flex items-center gap-3 shadow-xl" data-testid="undo-bar" role="status">
      <span>{text}</span>
      <button type="button" className="underline" onClick={onUndo} data-testid="undo-button">{label}</button>
    </div>
  );
}
