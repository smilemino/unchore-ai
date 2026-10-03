"use client";
import { useEffect, useRef, useState } from "react";
import { useT } from "./I18n";

// Pull down from the top on a phone to reload (ported from AI Soul, 2026-09-30 sync). The app shell is fixed
// (body doesn't scroll), so the browser's own pull-to-refresh never fires — this does it.
const TRIGGER = 90;
function scrolledAway(el: Element | null): boolean {
  for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
    const oy = getComputedStyle(e).overflowY;
    if ((oy === "auto" || oy === "scroll") && e.scrollHeight > e.clientHeight && e.scrollTop > 0) return true;
  }
  return false;
}
export function PullToRefresh() {
  const t = useT();
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const start = useRef<number | null>(null);
  const cur = useRef(0);
  useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    const down = (e: TouchEvent) => {
      const t = e.target as Element | null;
      start.current = e.touches.length === 1 && !scrolledAway(t) && !t?.closest("textarea,input,[data-no-ptr]") ? (e.touches[0]?.clientY ?? null) : null;
      cur.current = 0;
    };
    const move = (e: TouchEvent) => {
      if (start.current === null) return;
      const dy = (e.touches[0]?.clientY ?? start.current) - start.current;
      if (dy <= 0) { if (cur.current) { cur.current = 0; setPull(0); } start.current = dy < -8 ? null : start.current; return; }
      cur.current = Math.min(dy * 0.5, 120);
      setPull(cur.current);
    };
    const up = () => {
      const fire = start.current !== null && cur.current * 2 >= TRIGGER * 1.2;
      start.current = null; cur.current = 0; setPull(0);
      if (fire) { setBusy(true); window.location.reload(); }
    };
    document.addEventListener("touchstart", down, { passive: true });
    document.addEventListener("touchmove", move, { passive: true });
    document.addEventListener("touchend", up);
    document.addEventListener("touchcancel", up);
    return () => { document.removeEventListener("touchstart", down); document.removeEventListener("touchmove", move); document.removeEventListener("touchend", up); document.removeEventListener("touchcancel", up); };
  }, []);
  if (!pull && !busy) return null;
  const ready = pull * 2 >= TRIGGER * 1.2;
  return (
    <div className="pointer-events-none fixed left-0 right-0 z-50 flex justify-center" style={{ top: "env(safe-area-inset-top)", transform: `translateY(${busy ? 24 : pull - 20}px)` }}>
      <span className="rounded-full bg-surface border border-line px-3 py-1 text-xs text-fg-2 shadow">{busy ? (t("Refreshing…")) : ready ? (t("Release to refresh")) : (t("Pull to refresh"))}</span>
    </div>
  );
}
