// Command words in every language (2026-09-30 owner: «what works when I say it in Korean must work in each country's language,
// automatically»). Korean/English are hand-written beside each check; the other 56 languages live in lib/words/<id>.json.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { LANGS } from "@/lib/i18n";
import { afterNumberRe, exactRe, wordsRe } from "@/lib/words";

const ROOT = join(__dirname, "..");
const SRC = JSON.parse(readFileSync(join(ROOT, "lib/words/src.json"), "utf8")) as Record<string, { mode: string; meaning: string; en: string[]; ko: string[]; mirror?: string[] }>;
const OTHERS: string[] = LANGS.map((l) => l.code as string).filter((c) => c !== "en" && c !== "ko");
const load = (id: string) => JSON.parse(readFileSync(join(ROOT, "lib/words", `${id}.json`), "utf8")) as Record<string, string[]>;

describe("the word matcher", () => {
  const w = { de: ["erinner", "jeden tag"], ja: ["毎朝", "教えて"], fr: ["oui"] };
  it("spaced scripts: a phrase starts a word and may end mid-word; no-space scripts match inside a run", () => {
    expect(wordsRe(w).test("Bitte Erinnere mich")).toBe(true);
    expect(wordsRe(w).test("Jeden   Tag um 8")).toBe(true);
    expect(wordsRe(w).test("unerinnerlich")).toBe(false);
    expect(wordsRe(w).test("明日の毎朝8時に")).toBe(true);
    expect(wordsRe({}).test("anything")).toBe(false);
  });
  it("exact = the whole short message; afterNumber = right after a number", () => {
    expect(exactRe(w).test(" Oui ! ")).toBe(true);
    expect(exactRe(w).test("oui mais non")).toBe(false);
    expect(afterNumberRe({ de: ["minuten"], ja: ["分"] }).test("alle 5 Minuten")).toBe(true);
    expect(afterNumberRe({ ja: ["分"] }).test("30分後に")).toBe(true);
    expect(afterNumberRe({ de: ["minuten"] }).test("ein paar Minuten")).toBe(false);
  });
});

describe("every meaning, every language", () => {
  it("each meaning in lib/words/src.json has its file, examples in English and Korean, and a known way of matching", () => {
    for (const [id, s] of Object.entries(SRC)) {
      expect(existsSync(join(ROOT, "lib/words", `${id}.json`)), id).toBe(true);
      expect(s.en.length && s.ko.length && s.meaning.length > 10, id).toBeTruthy();
      expect(["contains", "exact", "afterNumber", "prefix", "heading"], id).toContain(s.mode);
    }
    const files = readdirSync(join(ROOT, "lib/words")).filter((f) => f.endsWith(".json") && f !== "src.json").map((f) => f.slice(0, -5));
    expect(files.filter((f) => !SRC[f])).toEqual([]);   // no leftover file without a meaning
  });
  it("no language is missing a list, and every phrase is clean (run «node scripts/i18n.mjs auto» when this fails)", () => {
    const bad: string[] = [];
    for (const id of Object.keys(SRC)) {
      const d = load(id);
      const min = ["exact", "afterNumber"].includes(SRC[id]!.mode) ? 1 : 2;
      for (const c of OTHERS) {
        const list = d[c];
        if (!Array.isArray(list) || !list.length) { bad.push(`${c} missing ${id}`); continue; }
        for (const p of list) if (typeof p !== "string" || p !== p.trim().toLowerCase() || [...p].length < min || p.length > 60) bad.push(`${c} ${id} «${p}»`);
      }
      for (const c of Object.keys(d)) if (!OTHERS.includes(c)) bad.push(`${id}: unknown language ${c}`);
    }
    expect(bad.slice(0, 20)).toEqual([]);
  });
  it("a standalone copy (the Defend skill) is the same as the list", () => {
    for (const [id, s] of Object.entries(SRC)) for (const m of s.mirror ?? []) expect(readFileSync(join(ROOT, m), "utf8"), m).toBe(readFileSync(join(ROOT, "lib/words", `${id}.json`), "utf8"));
  });
});

/** Korean in code outside lib/locales and lib/words must be on tests/korean-in-code.json with a reason — so a new Korean
 *  command («그만할게요»-style) can't arrive without its other 56 languages. Screens are covered by tests/i18n.test.ts. */
describe("Korean written in code", () => {
  const ALLOW = JSON.parse(readFileSync(join(ROOT, "tests/korean-in-code.json"), "utf8")) as Record<string, { literals?: string[]; words?: string[]; via?: string; koreanOnly?: string }>;
  const files = (dir: string): string[] => readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return /(^|\/)(node_modules|locales|words)$/.test(p) ? [] : files(p);
    return /\.(tsx?|mjs|js)$/.test(e.name) && !e.name.endsWith(".d.ts") ? [p] : [];
  });
  const found: Record<string, string[]> = {};
  for (const f of ["app", "components", "lib", "worker", "skills", "scripts"].flatMap(files)) {
    const src = readFileSync(join(ROOT, f), "utf8");
    if (!/[가-힣]/.test(src)) continue;
    const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, /x$/.test(f) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (n: ts.Node) => {
      const t = ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isJsxText(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n) || ts.isRegularExpressionLiteral(n) ? n.text : "";
      if (/[가-힣]/.test(t) && !(found[f] ??= []).includes(t)) found[f]!.push(t);
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  it("every Korean phrase in code is listed with its reason (new ones: meaning in lib/words/src.json → node scripts/i18n.mjs auto → list it)", () => {
    const fresh: string[] = [];
    for (const [f, lits] of Object.entries(found)) for (const l of lits) if (!ALLOW[f]?.literals?.includes(l)) fresh.push(`${f}: ${l.slice(0, 80)}`);
    expect(fresh).toEqual([]);
  });
  it("a file whose Korean is a command word really checks the other languages too", () => {
    const bad: string[] = [];
    for (const [f, a] of Object.entries(ALLOW)) {
      if (f.startsWith("_")) continue;
      if (!a.words?.length && !a.koreanOnly) bad.push(`${f}: no reason`);
      for (const id of a.words ?? []) {
        if (!SRC[id]) { bad.push(`${f}: unknown meaning ${id}`); continue; }
        const via = a.via ?? f;
        if (via.endsWith(".json")) {
          if (!SRC[id]!.mirror?.includes(via) || !readFileSync(join(ROOT, f), "utf8").includes(via.split("/").pop()!)) bad.push(`${f}: ${via} is not a copy of ${id} it reads`);
        } else if (!readFileSync(join(ROOT, via), "utf8").includes(`words/${id}.json`)) bad.push(`${via}: doesn't read lib/words/${id}.json`);
      }
    }
    expect(bad).toEqual([]);
  });
  it("no stale entries (a file that no longer has Korean, or a phrase that was removed)", () => {
    const stale: string[] = [];
    for (const [f, a] of Object.entries(ALLOW)) for (const l of a.literals ?? []) if (!found[f]?.includes(l)) stale.push(`${f}: ${l.slice(0, 60)}`);
    expect(stale).toEqual([]);
  });
});

