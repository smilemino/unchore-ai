"use client";
// Growth wheel (plan v11 §13 B): remember the first place a visitor came from, for the account made later (lib/growth-source.ts).
// A friend's link («?ref=…&try=…») wins over an older mark; otherwise the first touch stays. Nothing leaves the browser until sign-up.
import { useEffect } from "react";

export const TRY_KEY = "uc_try";

export function SourceMark() {
  useEffect(() => {
    try {
      const p = new URLSearchParams(location.search);
      const tryR = p.get("try");
      if (tryR && /^[a-z_]{2,40}$/.test(tryR)) localStorage.setItem(TRY_KEY, tryR);
      const ref = p.get("ref");
      const had = document.cookie.split("; ").some((c) => c.startsWith("uc_src="));
      let v = "";
      if (ref && /^[a-z2-9]{6,12}$/.test(ref)) v = `ref:${ref}`;
      else if (had) return;
      else if (p.get("utm_source")) v = `utm:${p.get("utm_source")}${p.get("utm_campaign") ? `/${p.get("utm_campaign")}` : ""}`;
      else if (document.referrer) { const h = new URL(document.referrer).host; if (h && !h.endsWith("unchore.ai")) v = `site:${h}`; }
      v = v.replace(/[^A-Za-z0-9._\-/:]/g, "").slice(0, 84);
      if (v) document.cookie = `uc_src=${encodeURIComponent(v)}; path=/; max-age=${30 * 86400}; samesite=lax`;
    } catch { /* old browser or blocked storage — nothing to remember */ }
  }, []);
  return null;
}
