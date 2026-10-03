// Collects every translation key from the code: the English text given to t("…"), tr(lang, "…") and k("…")
// (both sides of a `cond ? "a" : "b"` count). Used by scripts/i18n.mjs and tests/i18n.test.ts.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const DIRS = ["app", "components", "lib"];
const SKIP = /(^|\/)(node_modules|locales)(\/|$)/;

function files(root, dir) {
  const out = [];
  for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (SKIP.test(p)) continue;
    if (e.isDirectory()) out.push(...files(root, p));
    else if (/\.tsx?$/.test(e.name) && !/\.d\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}

/** The literal strings an argument can be (through parentheses and ?:), or null when it is computed. */
function literals(n) {
  while (ts.isParenthesizedExpression(n)) n = n.expression;
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return [n.text];
  if (ts.isConditionalExpression(n)) { const a = literals(n.whenTrue), b = literals(n.whenFalse); return a && b ? [...a, ...b] : null; }
  // t(m[code] || "fallback") — the fallback is a line too (2026-09-30: «Couldn't import…» showed in English in every language)
  if (ts.isBinaryExpression(n) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(n.operatorToken.kind)) { const b = literals(n.right); return b ? [...(literals(n.left) ?? []), ...b] : null; }
  return null;
}

/** { keys: Map<key, "file:line">, dynamic: ["file:line", …] } */
export function collectKeys(root) {
  const keys = new Map(), dynamic = [];
  for (const rel of DIRS.flatMap((d) => files(root, d))) {
    const src = readFileSync(join(root, rel), "utf8");
    if (!/\b(t|tr|k)\(/.test(src)) continue;
    const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, rel.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (n) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
        const name = n.expression.text;
        const arg = name === "tr" ? n.arguments[1] : name === "t" || name === "k" ? n.arguments[0] : undefined;
        if (arg) {
          const where = `${relative(root, join(root, rel))}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;
          const lits = literals(arg);
          if (lits) for (const s of lits) { if (s && !keys.has(s)) keys.set(s, where); }   // t(x ? "…" : "") — the empty side is not a line
          else dynamic.push(where);
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return { keys, dynamic };
}

/** «{n} of {total}» → ["n", "total"] (sorted) — a translation must keep exactly these. */
export const placeholders = (s) => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();
