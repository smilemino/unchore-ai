"use client";
import { useCallback, useEffect, useState } from "react";
import type { Lang } from "@/lib/i18n";
import { useT } from "./I18n";
import { describeSchedule, whenLabel } from "@/lib/schedule";
import { ShareButton } from "./ShareButton";
import { MonthCard } from "./MonthCard";
import { SkillTree } from "./SkillTree";

type Auto = { id: string; title: string; recipe: string; args?: { kind?: string } | null; schedule: string; status: string; last_line: string | null; last_run_at: string | null; next_run_at: string | null; fail_count: number; runs: number; runs30?: number; after_id?: string | null };

export function Automations({ lang, tz }: { lang: Lang; tz: string }) {
  const t = useT();
  const [list, setList] = useState<Auto[] | null>(null);
  const [preview, setPreview] = useState<Record<string, string>>({});
  const load = useCallback(() => { fetch("/api/automations").then((r) => r.json()).then(setList).catch(() => setList([])); }, []);
  useEffect(() => { load(); }, [load]);
  const fmt = (s: string | null) => s ? whenLabel(s, lang, tz) : "—";
  async function patch(id: string, body: object) {
    const r = await fetch(`/api/automations/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    if (r?.status === 409) alert(t("You already have {n} automations on. Pause or delete one first, then turn this on.", { n: (await r.json().catch(() => ({}))).max ?? 30 }));
    load();
  }
  async function del(id: string) { if (!confirm(t("Delete this automation?"))) return; await fetch(`/api/automations/${id}`, { method: "DELETE" }); load(); }
  async function run(id: string) {
    setPreview((p) => ({ ...p, [id]: "…" }));
    const r = await fetch(`/api/automations/${id}/run`, { method: "POST" }).then((x) => x.json()).catch(() => ({ ok: false, why: "error" }));
    setPreview((p) => ({ ...p, [id]: r.ok ? r.line : r.why === "needs_browser" ? t("This one needs the browser worker, which isn't connected yet. It will run as soon as it is.") : `⚠ ${r.why}` }));
  }
  const badge = (s: string) => ({ active: ["bg-green-600/15 text-green-700 dark:text-green-400", t("On")], paused: ["bg-bubble text-fg-2", t("Paused")], draft: ["bg-bubble text-fg-2", t("Draft")], broken: ["bg-warn-bg text-warn-fg", t("Stopped (needs a look)")] }[s] ?? ["bg-bubble", s]);
  return (
    <div className="h-full overflow-y-auto px-4 md:px-8 py-4">
      <div className="flex flex-col gap-3">
        <h1 className="text-lg md:text-xl font-bold">{t("Automations")}</h1>
        {list?.length ? <MonthCard list={list} /> : null}
        {list?.length ? <SkillTree list={list} /> : null}
        {list === null ? <div className="text-muted">…</div> : list.length === 0 ? <div className="rounded-lg border border-line-soft bg-surface px-4 py-3 text-sm text-fg-2">{t("No automations yet. Ask something you'd check again — Unchore will offer.")}</div> : list.map((a) => {
          const [cls, label] = badge(a.status);
          return (
            <div key={a.id} className="rounded-lg border border-line-soft bg-surface px-4 py-3 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="font-medium flex-1 truncate">{a.title}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${cls}`}>{label}</span>
              </div>
              {a.after_id
                ? <div className="text-sm text-fg-2">↳ {t("Runs right after «{title}»", { title: list.find((x) => x.id === a.after_id)?.title ?? "…" })}</div>
                : <div className="text-sm text-fg-2">{describeSchedule(a.schedule, { lang, t }, tz)} · {t("Next run")}: {a.status === "active" ? fmt(a.next_run_at) : "—"}</div>}
              {a.status === "draft" && a.last_line ? <div className="text-xs text-muted">{t("This is one real run, done just now. If it's right, turn it on — it will repeat on its schedule.")}</div> : null}
              {(preview[a.id] ?? a.last_line) && <div className="rounded-lg bg-panel px-3 py-2 text-sm">{preview[a.id] ?? a.last_line}</div>}
              <div className="flex flex-wrap gap-2 text-sm">
                <button onClick={() => run(a.id)} className="rounded-lg border border-line px-3 py-1 hover:bg-hover">{t("Try now")}</button>
                {a.status === "active"
                  ? <button onClick={() => patch(a.id, { status: "paused" })} className="rounded-lg border border-line px-3 py-1 hover:bg-hover">{t("Pause")}</button>
                  : <button onClick={() => patch(a.id, { status: "active" })} className="rounded-lg bg-ink text-on-ink px-3 py-1">{t("Turn on")}</button>}
                {list.length > 1 && a.args?.kind !== "nudge" ? (
                  <select value={a.after_id ?? ""} aria-label={t("Run right after")} onChange={async (e) => {
                    const r = await fetch(`/api/automations/${a.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ afterId: e.target.value || null }) });
                    if (!r.ok) alert(t("That would make a loop — pick another one.")); load();
                  }} className="rounded-lg border border-line bg-surface px-2 py-1 text-sm max-w-[14rem]">
                    <option value="">{t("On its own schedule")}</option>
                    {list.filter((x) => x.id !== a.id && x.args?.kind !== "nudge").map((x) => <option key={x.id} value={x.id}>{t("Run right after")}: {x.title}</option>)}
                  </select>
                ) : null}
                <button onClick={() => del(a.id)} className="rounded-lg border border-line px-3 py-1 text-red-600 hover:bg-hover">{t("Delete")}</button>
                {a.runs > 0 && a.status !== "broken" && a.args?.kind !== "nudge" && <ShareButton automationId={a.id} recipe={a.recipe} />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
