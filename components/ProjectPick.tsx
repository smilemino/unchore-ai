"use client";
import { useState } from "react";
import { useT } from "./I18n";

export type PickProject = { id: string; name: string; archived?: boolean };

// «Move to project» in a chat's menu, with a box to find a project by name or make one with that name (AI Soul ProjectFlyout).
// Enter picks the exact name, or makes it. The menu closes after a pick, so the box starts empty next time.
export function ProjectPick({ projects, current, onPick }: { projects: PickProject[]; current: string | null; onPick: (id: string | null) => void }) {
  const t = useT();
  const [find, setFind] = useState("");
  const word = find.trim();
  const shown = projects.filter((p) => (!p.archived || current === p.id) && (!word || p.name.toLowerCase().includes(word.toLowerCase())));
  const exact = projects.find((p) => p.name.trim() === word);
  const make = async () => {
    const r = await fetch("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: word }) }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as { id?: string } | null;
    if (r?.ok && j?.id) onPick(j.id);
  };
  const row = "block w-full text-left px-3 py-1 hover:bg-hover truncate";
  return (
    <>
      <input value={find} onChange={(e) => setFind(e.target.value)} maxLength={80} placeholder={`🔍 ${t("Projects")}`} aria-label={t("Move to project")} data-testid="conv-project-find"
        onKeyDown={(e) => { if (e.key !== "Enter" || e.nativeEvent.isComposing || !word) return; e.preventDefault(); if (exact) onPick(exact.id); else void make(); }}
        className="mx-3 my-1 w-[calc(100%-1.5rem)] rounded border border-line px-2 py-1 text-sm bg-transparent" />
      {word ? null : <button className={`${row} text-fg-2`} onClick={() => onPick(null)}>— {t("No project")}</button>}
      <div className="max-h-56 overflow-y-auto">
        {shown.map((p) => <button key={p.id} className={row} onClick={() => onPick(p.id)}>{current === p.id ? "✓ " : ""}{p.name}</button>)}
      </div>
      {word && !exact ? <button className={row} data-testid="conv-project-create" onClick={() => void make()}>＋ {t("New project")}: «{word}»</button> : null}
    </>
  );
}
