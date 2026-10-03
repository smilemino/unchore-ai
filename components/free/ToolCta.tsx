"use client";
import Link from "next/link";
// The one line about Unchore under a free tool, and where the visitor came from (for the growth wheel's numbers).
import { useEffect } from "react";
import { useT } from "@/components/I18n";

export const ASK_KEY = "uc_ask";

/** First touch on a tool page: «utm:tool-<slug>/<site they came from or direct>» (lib/growth-source.ts keeps this shape). */
export function ToolSource({ slug }: { slug: string }) {
  useEffect(() => {
    try {
      if (document.cookie.split("; ").some((c) => c.startsWith("uc_src="))) return;
      const p = new URLSearchParams(location.search);
      if (p.get("ref") || p.get("utm_source")) return;   // a friend's link or a campaign speaks for itself (components/SourceMark.tsx)
      let from = "direct";
      try { const h = document.referrer ? new URL(document.referrer).host : ""; if (h && !h.endsWith("unchore.ai")) from = h; } catch { /* no referrer */ }
      const v = `utm:tool-${slug}/${from}`.replace(/[^A-Za-z0-9._\-/:]/g, "").slice(0, 84);
      document.cookie = `uc_src=${encodeURIComponent(v)}; path=/; max-age=${30 * 86400}; samesite=lax`;
    } catch { /* blocked cookies — nothing to remember */ }
  }, [slug]);
  return null;
}

/** «Want it done every time?» → sign in; the first chat starts with the tool's sentence filled in (never sent by itself). */
export function ToolCta({ ask }: { ask: string }) {
  const t = useT();
  const go = () => { try { localStorage.setItem(ASK_KEY, ask); } catch { /* blocked storage */ } };
  return (
    <section className="rounded-xl border border-line bg-panel px-4 py-3 flex flex-col gap-2" data-testid="tool-cta">
      <div className="font-medium">{t("Doing this again and again? Unchore can do it for you, every time.")}</div>
      <div className="text-sm text-fg-2">{t("Unchore is a personal AI: ask anything, and when something repeats it offers to automate it — and builds it. Free to start.")}</div>
      <Link href="/" onClick={go} className="self-start rounded-lg bg-ink text-on-ink px-3 py-1.5 text-sm">{t("Make it run by itself →")}</Link>
    </section>
  );
}
