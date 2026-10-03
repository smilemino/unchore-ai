// 58 languages, picked automatically (2026-09-30 owner: «used in 100 countries, every page»).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { LANGS, asLang, countryLang, fill, isRtl, makeT, matchLang, pickLang, speechTag } from "@/lib/i18n";
import { dictFor, tr } from "@/lib/i18n-server";
import { collectKeys, placeholders } from "../scripts/i18n-keys.mjs";

const ROOT = join(__dirname, "..");
const { keys } = collectKeys(ROOT) as { keys: Map<string, string> };
const bare = (k: string) => k.replace(/#\w+$/, "");

describe("which language a visitor gets", () => {
  it("their own pick first, then the browser's languages in order, then the country, then English", () => {
    expect(pickLang("fr-FR,fr;q=0.9", "ja", "DE")).toBe("ja");
    expect(pickLang("fr-CH,fr;q=0.9,de;q=0.8", null, "CH")).toBe("fr");
    expect(pickLang("xx-YY,de;q=0.5", null, "FR")).toBe("de");   // first language we don't have → next one the browser lists
    expect(pickLang("gd-GB", null, "BR")).toBe("pt");              // none of ours → the country
    expect(pickLang("", null, "KR")).toBe("ko");
    expect(pickLang(null, null, "ZZ")).toBe("en");
    expect(pickLang("de;q=0.2,ko;q=0.9", null, null)).toBe("ko");   // q-values, not position
    expect(pickLang("de,en", "not-a-language", null)).toBe("de");
  });
  it("regional and old browser codes land on ours", () => {
    expect(matchLang("zh-HK")).toBe("zh-TW");
    expect(matchLang("zh-Hant-TW")).toBe("zh-TW");
    expect(matchLang("zh")).toBe("zh-CN");
    expect(matchLang("pt-PT")).toBe("pt");
    expect(matchLang("nn-NO")).toBe("nb");
    expect(matchLang("iw")).toBe("he");
    expect(matchLang("tl-PH")).toBe("fil");
    expect(matchLang("es_MX")).toBe("es");
    expect(matchLang("klingon")).toBeNull();
    expect(asLang(undefined)).toBe("en");
  });
  it("covers at least 100 countries, each once, and every language has a speech tag", () => {
    const all = LANGS.flatMap((l) => [...l.countries]);
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBeGreaterThanOrEqual(100);
    expect(countryLang("jp")).toBe("ja");
    expect(countryLang("MX")).toBe("es");
    for (const l of LANGS) expect(speechTag(l.code)).toMatch(/^[a-z]{2,3}-[A-Z]{2}$/);
    expect(speechTag("ja-JP")).toBe("ja-JP");
    expect(LANGS.filter((l) => isRtl(l.code)).map((l) => l.code).sort()).toEqual(["ar", "fa", "he", "ur"]);
  });
});

describe("translator", () => {
  it("falls back to the English line (without its #context) and fills {names}", () => {
    const t = makeT({ "Hi {name}": "안녕 {name}" });
    expect(t("Hi {name}", { name: "Ann" })).toBe("안녕 Ann");
    expect(t("Paused#count")).toBe("Paused");
    expect(fill("{a} {b}", { a: 1 })).toBe("1 {b}");
    expect(tr("ko", "Sign out")).toBe("로그아웃");
    expect(tr("xx", "Sign out")).toBe("Sign out");
  });
});

describe("every line in every language", () => {
  it("the code has lines to translate and Korean has all of them, word for word as people wrote them", () => {
    expect(keys.size).toBeGreaterThan(300);
    const ko = dictFor("ko");
    expect([...keys.keys()].filter((k) => !ko[k])).toEqual([]);
  });
  it("no language is missing a line, and every translation keeps the same {placeholders}", () => {
    const bad: string[] = [];
    for (const l of LANGS) {
      if (l.code === "en") continue;
      const d = dictFor(l.code);
      for (const k of keys.keys()) {
        const v = d[k];
        if (!v?.trim()) bad.push(`${l.code} missing «${k.slice(0, 50)}»`);
        else if (placeholders(bare(k)).join() !== placeholders(v).join()) bad.push(`${l.code} placeholders «${k.slice(0, 50)}» → «${v.slice(0, 50)}»`);
        else if (/#\w+$/.test(v)) bad.push(`${l.code} kept the #context «${v.slice(0, 50)}»`);
      }
    }
    // Missing lines? Run `node scripts/i18n.mjs fill` (translates with the server's claude command, then reviews).
    expect(bad.slice(0, 20)).toEqual([]);
  });
});

/** Korean inside string literals or JSX text of screens — it must live in lib/locales/ko.json instead. */
describe("no Korean written into screens", () => {
  const ALLOW = [/components\/Settings\.tsx: const kr:/];   // Korean city names for the time-zone line (Korean only)
  const files = (dir: string): string[] => readdirSync(join(ROOT, dir), { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []));
  it("app/ and components/ hold no Hangul outside comments and patterns", () => {
    const hits: string[] = [];
    for (const f of [...files("app"), ...files("components")]) {
      const src = readFileSync(join(ROOT, f), "utf8");
      if (!/[가-힣]/.test(src)) continue;
      const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, f.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      const visit = (n: ts.Node) => {
        const text = ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isJsxText(n) ? n.text
          : ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n) ? n.text : "";
        if (/[가-힣]/.test(text)) {
          const line = src.split("\n")[sf.getLineAndCharacterOfPosition(n.getStart(sf)).line] ?? "";
          const at = `${f}: ${line.trim()}`;
          if (!ALLOW.some((re) => re.test(at))) hits.push(at.slice(0, 120));
        }
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
    expect(hits).toEqual([]);
  });
});
