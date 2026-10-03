"use client";
import { useEffect } from "react";

// Quiet sign-in extension (ported from AI Soul, 2026-09-30 sync): opening the app at most twice a day pushes the sign-in's end date
// 30 days out, so people who use Unchore are never logged out after 30 days.
const KEY = "uc-session-refreshed-at";
export function SessionRefresh() {
  useEffect(() => {
    let last = 0;
    try { last = Number(localStorage.getItem(KEY) ?? 0); } catch { /* no storage */ }
    if (Date.now() - last < 12 * 3600 * 1000) return;
    fetch("/api/auth/refresh", { method: "POST" }).then((r) => { if (r.ok) { try { localStorage.setItem(KEY, String(Date.now())); } catch { /* no storage */ } } }).catch(() => {});
  }, []);
  return null;
}
