"use client";
import { RECIPE_TITLES, SKILL_BRANCHES } from "@/lib/recipe-titles";
import { useT } from "./I18n";

// Skill tree (benchmark 2026-09-30: «skills you learn one by one, like a game» — people come back to light the next one).
// A skill is lit when an automation on that recipe is on. An unlit one starts in chat with its first sentence filled in.
type Auto = { id: string; title: string; recipe: string; status: string; after_id?: string | null };

export function SkillTree({ list }: { list: Auto[] }) {
  const t = useT();
  const on = new Set(list.filter((a) => a.status === "active").map((a) => a.recipe === "prompt" ? "reminder" : a.recipe));
  const all = SKILL_BRANCHES.flatMap((b) => b.skills);
  const lit = all.filter((s) => on.has(s.recipe)).length;
  // Next skill: the first unlit one in the branch they've gone furthest in (or the very first one).
  const best = [...SKILL_BRANCHES].sort((a, b) => b.skills.filter((s) => on.has(s.recipe)).length - a.skills.filter((s) => on.has(s.recipe)).length)[0]!;
  const next = best.skills.find((s) => !on.has(s.recipe)) ?? all.find((s) => !on.has(s.recipe));
  const chains = list.filter((a) => a.after_id).length;
  return (
    <section className="rounded-lg border border-line-soft bg-surface px-4 py-3 flex flex-col gap-3" data-testid="skill-tree">
      <div className="flex items-baseline gap-2">
        <h2 className="font-semibold">🌳 {t("Skill tree")}</h2>
        <span className="text-sm text-muted">{t("{lit} of {all} skills on", { lit, all: all.length })}{chains ? ` · ${t("{n} chained", { n: chains })}` : ""}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {SKILL_BRANCHES.map((b) => (
          <div key={b.name} className="flex flex-col gap-1">
            <div className="text-xs font-medium text-muted">{t(b.name)}</div>
            <div className="flex flex-wrap gap-1.5">
              {b.skills.map((s) => on.has(s.recipe)
                ? <span key={s.recipe} className="rounded-full bg-green-600/15 text-green-700 dark:text-green-400 px-2.5 py-1 text-xs">✓ {t(RECIPE_TITLES[s.recipe] ?? s.recipe)}</span>
                : <a key={s.recipe} href={`/app?text=${encodeURIComponent(t(s.ask))}`} className="rounded-full border border-dashed border-line px-2.5 py-1 text-xs text-fg-2 hover:bg-hover">○ {t(RECIPE_TITLES[s.recipe] ?? s.recipe)}</a>)}
            </div>
          </div>
        ))}
      </div>
      {next ? <a href={`/app?text=${encodeURIComponent(t(next.ask))}`} className="self-start rounded-lg bg-ink text-on-ink px-3 py-1.5 text-sm" data-testid="next-skill">{t("Next skill")}: {t(RECIPE_TITLES[next.recipe] ?? next.recipe)} →</a> : null}
      {/* Benchmark 2026-10-01 («one job, one screen» tools): a small tool of your own, built and put online from one sentence. */}
      <a href={`/app?text=${encodeURIComponent(t("Build me a small one-page tool (a timer, a calculator, a checklist…) and put it online. Ask me what it should do."))}`} className="self-start rounded-full border border-dashed border-line px-2.5 py-1 text-xs text-fg-2 hover:bg-hover" data-testid="build-tool">🛠 {t("Make your own small tool and put it online")}</a>
      <div className="text-xs text-muted">{t("Chain skills: on an automation, pick «Run right after» — it runs when the other one finishes and gets its result (e.g. competitor ads → an AI brief with new ad ideas).")}</div>
    </section>
  );
}
