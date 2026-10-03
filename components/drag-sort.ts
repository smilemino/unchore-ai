"use client";
// Drag to reorder pinned chats and projects (ported from AI Soul components/drag-sort.ts, 2026-09-30).
// Mouse: press and move 5px to start (a plain press still opens the row). Finger: hold 0.35 s, then drag — moving at once scrolls.
// A blue line shows where it will land; on drop, onDrop(id, the id right after it | null for the end).
// The click that ends a drop is eaten at window capture, before Shell's link catcher (back-nav) can start a navigation.
import { useEffect, useRef, useState } from "react";
import type React from "react";
import { dropTarget } from "@/lib/drag-order";

const HOLD_MS = 350, MOUSE_START_PX = 5, TOUCH_SLOP_PX = 8;
type Press = { id: string; x: number; y: number; touch: boolean; on: boolean; el: HTMLElement; timer?: ReturnType<typeof setTimeout>; frozen?: { el: HTMLElement; was: string } };
type SetDrag = (d: { id: string; before: string | null } | null) => void;
function begin(p: Press, setDrag: SetDrag) {
  p.on = true; document.body.style.userSelect = "none"; setDrag({ id: p.id, before: p.id });
  if (p.touch) for (let el = p.el.parentElement; el; el = el.parentElement) { const o = getComputedStyle(el).overflowY; if (o === "auto" || o === "scroll") { p.frozen = { el, was: el.style.overflowY }; el.style.overflowY = "hidden"; break; } }
  try { navigator.vibrate?.(15); } catch { /* no vibration here */ }
}

export function useDragSort(group: string, onDrop: (id: string, before: string | null) => void, enabled = true) {
  const [drag, setDrag] = useState<{ id: string; before: string | null } | null>(null);
  const press = useRef<Press | null>(null);
  const eatClick = useRef(false);
  const dropRef = useRef(onDrop);
  useEffect(() => { dropRef.current = onDrop; }, [onDrop]);
  useEffect(() => {
    const target = (y: number, id: string) => dropTarget(Array.from(document.querySelectorAll<HTMLElement>(`[data-sort-group="${group}"]`)).map((el) => { const r = el.getBoundingClientRect(); return { id: el.dataset.sortId ?? "", top: r.top, height: r.height }; }), y, id);
    const stop = () => { const p = press.current; if (p?.timer) clearTimeout(p.timer); if (p?.frozen) p.frozen.el.style.overflowY = p.frozen.was; press.current = null; document.body.style.userSelect = ""; setDrag(null); };
    const moved = (x: number, y: number) => {
      const p = press.current;
      if (!p) return;
      if (!p.on) {
        const d = Math.hypot(x - p.x, y - p.y);
        if (p.touch) { if (d > TOUCH_SLOP_PX) stop(); return; }
        if (d <= MOUSE_START_PX) return;
        begin(p, setDrag);
      }
      setDrag({ id: p.id, before: target(y, p.id) });
    };
    const finish = (y: number) => {
      const p = press.current;
      if (!p) return;
      const before = p.on ? target(y, p.id) : p.id;
      if (before !== p.id) {
        eatClick.current = true; setTimeout(() => { eatClick.current = false; }, 0);
        dropRef.current(p.id, before);
      }
      stop();
    };
    const move = (e: PointerEvent) => { if (press.current && !press.current.touch) moved(e.clientX, e.clientY); };
    const up = (e: PointerEvent) => { if (press.current && !press.current.touch) finish(e.clientY); };
    const cancel = () => { if (press.current && !(press.current.touch && press.current.on)) stop(); };
    const touchMove = (e: TouchEvent) => {
      const p = press.current, t = e.touches[0];
      if (!p?.touch || !t) return;
      if (p.on && e.cancelable) e.preventDefault();
      moved(t.clientX, t.clientY);
    };
    const touchEnd = (e: TouchEvent) => { const p = press.current, t = e.changedTouches[0]; if (p?.touch) { if (t) finish(t.clientY); else stop(); } };
    const eat = (e: MouseEvent) => { if (eatClick.current) { e.preventDefault(); e.stopImmediatePropagation(); eatClick.current = false; } };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("touchmove", touchMove, { passive: false });
    window.addEventListener("click", eat, true);
    window.addEventListener("touchend", touchEnd);
    const touchCancel = () => { if (press.current?.touch) stop(); };
    window.addEventListener("touchcancel", touchCancel);
    return () => { window.removeEventListener("touchend", touchEnd); window.removeEventListener("touchcancel", touchCancel); window.removeEventListener("click", eat, true); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancel); window.removeEventListener("touchmove", touchMove); stop(); };
  }, [group]);

  const handle = (id: string) => enabled ? {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0 || press.current || (e.target as HTMLElement).closest("button,input,textarea")) return;
      const p: Press = { id, x: e.clientX, y: e.clientY, touch: e.pointerType === "touch", on: false, el: e.currentTarget };
      if (p.touch) p.timer = setTimeout(() => { if (press.current === p) begin(p, setDrag); }, HOLD_MS);
      press.current = p;
    },
    onDragStart: (e: React.DragEvent) => e.preventDefault(),
    onContextMenu: (e: React.MouseEvent) => { if (press.current?.touch) e.preventDefault(); },
    onTouchMove: (e: React.TouchEvent) => { if (press.current?.on) e.stopPropagation(); },
  } : {};
  const slot = (id: string) => enabled ? { "data-sort-group": group, "data-sort-id": id } : {};
  const cls = (id: string, last = false) => !enabled ? "" : `select-none [-webkit-touch-callout:none] ${drag?.id === id ? "opacity-50" : ""} ${drag && drag.before !== drag.id ? (drag.before === id ? "shadow-[inset_0_2px_0_0_#3b82f6]" : last && drag.before === null ? "shadow-[inset_0_-2px_0_0_#3b82f6]" : "") : ""}`;
  return { handle, slot, cls, dragging: drag?.id ?? null };
}
