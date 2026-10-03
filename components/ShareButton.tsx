"use client";
// «Send to a friend» (plan v11 §13 A): once an automation has worked, one tap shares a link that sets up the same recipe.
// Only the recipe's name travels — never the member's own settings (what they watch, where, when).
import { useState } from "react";
import { useT } from "./I18n";
import { RECIPE_TITLES } from "@/lib/recipe-titles";

export function ShareButton({ automationId, recipe, className = "" }: { automationId: string; recipe: string; className?: string }) {
  const t = useT();
  const [note, setNote] = useState("");
  if (!RECIPE_TITLES[recipe]) return null;
  async function share() {
    const r = await fetch("/api/share", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ automationId }) }).then((x) => x.ok ? x.json() : null).catch(() => null);
    if (!r?.url) { setNote(t("Couldn't make the link. Try again in a moment.")); return; }
    const text = t("I set up «{recipe}» on Unchore and now it runs by itself. Try it:", { recipe: t(RECIPE_TITLES[recipe]!) });
    try {
      if (navigator.share) { await navigator.share({ title: "Unchore", text, url: r.url }); return; }
    } catch { /* closed the share sheet — fall back to copying */ }
    try { await navigator.clipboard.writeText(`${text} ${r.url}`); setNote(t("Link copied — paste it to a friend.")); }
    catch { setNote(r.url); }
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <button onClick={share} className={`rounded-lg border border-line px-3 py-1 hover:bg-hover ${className}`}>🎁 {t("Send to a friend")}</button>
      {note && <span className="text-xs text-fg-2 break-all">{note}</span>}
    </span>
  );
}
