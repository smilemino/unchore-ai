"use client";
import Link from "next/link";
import { useState } from "react";
import { useT } from "@/components/I18n";
import { QUESTIONS, TYPES, choreType, type TypeId } from "@/lib/free-tools/chore-type";
import { ASK_KEY } from "./ToolCta";

export function ChoreType({ shared, path }: { shared: TypeId | null; path: string }) {
  const t = useT();
  const [picks, setPicks] = useState<TypeId[]>([]);
  const [note, setNote] = useState("");
  const [fresh, setFresh] = useState(false);   // «take the test» after opening a friend's result
  const result: TypeId | null = picks.length === QUESTIONS.length ? choreType(picks) : picks.length === 0 && !fresh ? shared : null;
  if (result) {
    const ty = TYPES[result];
    const link = `https://unchore.ai${path}${path.includes("?") ? "&" : "?"}r=${result}`;
    const share = async () => {
      const text = t("I'm «{type}» {emoji}. What kind of chore-doer are you?", { type: t(ty.name), emoji: ty.emoji });
      try { if (navigator.share) { await navigator.share({ title: "Unchore", text, url: link }); return; } } catch { /* closed */ }
      try { await navigator.clipboard.writeText(`${text} ${link}`); setNote(t("Link copied — paste it to a friend.")); } catch { setNote(link); }
    };
    return (
      <section className="flex flex-col gap-3" data-testid="chore-type-result">
        <div className="rounded-2xl bg-panel px-5 py-5 flex flex-col gap-2 text-center">
          <div className="text-5xl">{ty.emoji}</div>
          <div className="text-2xl font-semibold">{t(ty.name)}</div>
          <div className="text-fg-2">{t(ty.line)}</div>
          <div className="text-sm">{t("The first chore Unchore would take off your hands:")} <b>{t(ty.first)}</b></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={share} className="rounded-lg bg-ink text-on-ink px-3 py-1.5">🎁 {t("Share my type")}</button>
          <Link href="/" onClick={() => { try { localStorage.setItem(ASK_KEY, t(ty.first)); } catch { /* blocked */ } }} className="rounded-lg border border-line px-3 py-1.5 hover:bg-hover">{t("Hand off that chore")}</Link>
          <button onClick={() => { setPicks([]); setNote(""); setFresh(true); history.replaceState(null, "", path); }} className="rounded-lg border border-line px-3 py-1.5 hover:bg-hover">{picks.length ? t("Take it again") : t("Take the test")}</button>
        </div>
        {note && <p className="text-sm text-fg-2 break-all">{note}</p>}
      </section>
    );
  }
  const q = QUESTIONS[picks.length]!;
  return (
    <section className="flex flex-col gap-3" data-testid="chore-type-q">
      <div className="text-sm text-fg-2">{t("{n} of {all}", { n: picks.length + 1, all: QUESTIONS.length })}</div>
      <div className="text-lg font-medium">{t(q.q)}</div>
      <div className="flex flex-col gap-2">{q.a.map(([label, id]) => (
        <button key={label} onClick={() => setPicks([...picks, id])} className="rounded-lg border border-line bg-surface px-3 py-2 text-left hover:bg-hover">{t(label)}</button>))}</div>
    </section>
  );
}
