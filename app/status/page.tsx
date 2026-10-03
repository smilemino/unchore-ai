import Link from "next/link";
import { hasDb, q } from "@/lib/db";
import { RECIPES } from "@/lib/recipes";
import { requestLang, trFor } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

// Public status: the latest nightly self-check for each verified recipe.
export default async function Status() {
  const t = trFor(await requestLang());
  const rows = hasDb()
    ? await q<{ recipe: string; ok: boolean; detail: string; checked_at: string }>(
        "select distinct on (recipe) recipe, ok, detail, checked_at from recipe_health order by recipe, checked_at desc").catch(() => [])
    : [];
  const by = new Map(rows.map((r) => [r.recipe, r]));
  return (
    <main className="mx-auto max-w-3xl px-5 py-10 flex flex-col gap-6">
      <Link href="/" className="font-semibold">← Unchore</Link>
      <h1 className="text-2xl font-semibold">{t("Recipe status")}</h1>
      <p className="text-fg-2">{t("Every night Unchore re-runs each verified recipe. If a site changes, the recipe is marked here and automations using it stop instead of guessing.")}</p>
      <ul className="flex flex-col gap-2">
        {RECIPES.map((r) => {
          const h = by.get(r.id);
          return (
            <li key={r.id} className="rounded-xl border border-line bg-surface px-4 py-3 flex items-center gap-3">
              <span>{h ? (h.ok ? "✅" : "❌") : "⏳"}</span>
              <span className="font-medium w-40">{t(r.title.en)}</span>
              <span className="text-sm text-fg-2 flex-1 truncate">{h ? h.detail : t(r.where === "browser" ? "checked by the browser worker" : "not checked yet")}</span>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
