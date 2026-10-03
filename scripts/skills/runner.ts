// The script bundled into skills/unchore-recipes (2026-09-30 marketing plan v2: «recipes run in any agent»).
// Any agent that reads SKILL.md runs:  node scripts/run.mjs <recipe> '<json args>'   →  one JSON line.
// Same verified recipes as the app: a recipe never returns a value it isn't sure about.
import { PORTABLE } from "./portable";

async function main(argv: string[]): Promise<number> {
  const [id, raw] = argv;
  if (!id || id === "--list") {
    console.log(JSON.stringify(PORTABLE.map((r) => ({ id: r.id, title: r.title.en, catalog: r.catalog, korea: !!r.korea, example: r.canary ?? null }))));
    return 0;
  }
  const r = PORTABLE.find((x) => x.id === id);
  if (!r) { console.log(JSON.stringify({ ok: false, why: `unknown recipe ${id} — run with --list` })); return 2; }
  let args: unknown;
  try { args = JSON.parse(raw ?? "{}"); } catch { console.log(JSON.stringify({ ok: false, why: "arguments must be JSON" })); return 2; }
  const parsed = r.args.safeParse(args);
  if (!parsed.success) { console.log(JSON.stringify({ ok: false, why: "bad arguments", expected: r.catalog })); return 2; }
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const lang = r.korea ? "ko" : "en";
  try {
    const res = await r.run(parsed.data as never, { lang, tz });
    console.log(JSON.stringify(res));
    return res.ok ? 0 : 1;
  } catch (e) {
    console.log(JSON.stringify({ ok: false, why: (e as Error).message.slice(0, 200) }));
    return 1;
  }
}

main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
