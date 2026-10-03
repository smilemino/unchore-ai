"use client";
import { useEffect, useRef, useState } from "react";
import { useT } from "./I18n";
import { versionAction } from "@/lib/new-version";

// «A new version is out» — see lib/new-version.ts (ported from AI Soul, 2026-09-30 sync).
const EVERY_MS = 60_000;
async function versionNow(): Promise<string | null> {
  try { const r = await fetch("/api/health", { cache: "no-store" }); if (!r.ok) return null; const j = (await r.json()) as { version?: string | null }; return j.version ?? null; } catch { return null; }
}
export function NewVersion() {
  const t = useT();
  const base = useRef<string | null>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    let alive = true;
    const check = async () => {
      const now = await versionNow();
      if (!alive || !now) return;
      if (!base.current) { base.current = now; return; }
      const el = document.activeElement;
      const typing = !!el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT") && !!(el as HTMLTextAreaElement).value;
      const a = versionAction({ base: base.current, now, hidden: document.visibilityState === "hidden", voiceOpen: !!document.querySelector("[data-voice-on]"), typing });
      if (a === "reload") window.location.reload();
      else if (a === "banner") setShow(true);
    };
    void check();
    const t = setInterval(() => void check(), EVERY_MS);
    const onVis = () => void check();
    document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, []);
  if (!show) return null;
  return (
    <button type="button" onClick={() => window.location.reload()} className="fixed top-2 left-1/2 -translate-x-1/2 z-[60] rounded-full border border-line bg-surface px-4 py-2 text-sm shadow-lg hover:bg-hover-2">
      {t("A new version is out — tap to refresh")}
    </button>
  );
}
