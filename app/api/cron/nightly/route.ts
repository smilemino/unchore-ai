import { NextResponse } from "next/server";
import { sweepPieces } from "@/lib/big-files";
import { cronOk } from "@/lib/api";
import { q } from "@/lib/db";
import { esc, sendMail } from "@/lib/mail";
import { prunePrivacy } from "@/lib/privacy";
import { RECIPES, runRecipe } from "@/lib/recipes";
import { faceReport, faceTable, growthLine, growthNumbers } from "@/lib/metrics";

export const maxDuration = 300;

// Nightly self-check: every recipe with a canary runs once. Results feed /status and the owners' morning mail.
export async function GET(req: Request) {
  if (!cronOk(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const rows: { recipe: string; ok: boolean; detail: string }[] = [];
  for (const r of RECIPES) {
    if (!r.canary) continue;
    const res = await runRecipe(r.id, r.canary, { lang: "en", tz: "Asia/Seoul" });
    const detail = res.ok ? res.line : res.why;
    if (!res.ok && res.why === "needs_browser") continue; // browser worker checks these itself
    rows.push({ recipe: r.id, ok: res.ok, detail });
    await q("insert into recipe_health(recipe, ok, detail) values ($1, $2, $3)", [r.id, res.ok, detail.slice(0, 500)]);
  }
  const pruned = await prunePrivacy().catch(() => null);
  // Big uploads left half-way (app/api/files/upload) — pieces older than a day go; files over 50 MB keep theirs (lib/big-files.ts).
  await sweepPieces().catch(() => null);
  await q("delete from uploads where created_at < now() - interval '1 day'").catch(() => null);
  const [users, active, runs24] = await Promise.all([
    q<{ n: number }>("select count(*)::int as n from users"),
    q<{ n: number }>("select count(*)::int as n from automations where status = 'active'"),
    q<{ n: number; ok: number }>("select count(*)::int as n, count(*) filter (where ok)::int as ok from runs where started_at > now() - interval '24 hours'"),
  ]);
  const broken = rows.filter((r) => !r.ok);
  const faces = await faceReport().catch(() => []);
  const growth = await growthNumbers().then(growthLine).catch(() => "Growth: could not read");
  const owners = (process.env.OWNER_EMAILS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const html = `<h3>Unchore nightly check</h3><p>Users ${users[0]?.n ?? 0} · active automations ${active[0]?.n ?? 0} · runs 24h ${runs24[0]?.n ?? 0} (ok ${runs24[0]?.ok ?? 0})</p>
    <p><b>${esc(growth)}</b></p>
    <ul>${rows.map((r) => `<li>${r.ok ? "✅" : "❌"} <b>${esc(r.recipe)}</b> — ${esc(r.detail)}</li>`).join("")}</ul>
    <p>Daily notes: now reviewed hourly at 04:00 in each member's own time zone (cron tick).</p>${faceTable(faces)}`;
  for (const o of owners) await sendMail(o, `Unchore nightly — ${broken.length ? `${broken.length} recipe(s) broken` : "all recipes OK"}`, html, rows.map((r) => `${r.ok ? "OK" : "BROKEN"} ${r.recipe}: ${r.detail}`).join("\n"));
  return NextResponse.json({ checked: rows.length, broken: broken.map((b) => b.recipe), pruned, faces, growth });
}

/** Daily notes (lib/nudge.ts): make sure every onboarded member who wants one has it, learn from last week, prepare tomorrow's. */
