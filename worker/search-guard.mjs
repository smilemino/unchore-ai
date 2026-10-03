// Web-search checkpoint for the member's own Claude plan (ported from AI Soul lib/search-guard.ts, 2026-10-01).
// Claude Code calls this as a PreToolUse hook right before a WebSearch leaves for the search company: a query that looks like
// a national ID, phone, card, bank account, e-mail or secret key is stopped and Claude is told to search with general words.
// No imports from the app — the hook runs this file on its own (`node search-guard.mjs --hook`).

export const KEY_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\bsk-(?:ant-|or-|proj-)?[A-Za-z0-9_-]{20,}/g,
  /\b(?:ghp|gho|ghs|ghu|ghr)_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{30,}/g,
  /\b\d{8,10}:AA[A-Za-z0-9_-]{30,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b|\bAIza[0-9A-Za-z_-]{35}\b|\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
];
const PII = [
  ["national ID number", /(?<!\d)\d{6}\s?-\s?[1-8]\d{6}(?!\d)/g],
  ["phone number", /(?<![\d-])(?:01[016789]|0[2-6]\d?)[\s.-]?\d{3,4}[\s.-]?\d{4}(?![\d-])|\+\d{1,3}[\s.-]?\(?\d{1,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}(?!\d)/g],
  ["card number", /(?<!\d)\d{4}[\s-]\d{4}[\s-]\d{4}[\s-]\d{3,4}(?!\d)|(?<!\d)\d{15,16}(?!\d)/g],
  ["bank account number", /(?<![\d-])\d{2,6}-\d{2,6}-\d{2,7}(?:-\d{1,3})?(?![\d-])/g],
  ["e-mail address", /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g],
];

const DATE = /^(19|20)\d{2}[-.]\d{1,2}[-.]\d{1,2}$/;

/** What in this search looks private (empty = let it go). */
export function checkQuery(q) {
  const s = String(q ?? "");
  const hits = [];
  if (KEY_PATTERNS.some((re) => new RegExp(re.source, "g").test(s))) hits.push("secret key");
  for (const [label, re] of PII) {
    const found = [...s.matchAll(new RegExp(re.source, "g"))].map((m) => m[0]).filter((m) => !DATE.test(m.trim()));   // «2026-10-01» is a date, not an account
    if (found.length) hits.push(label);
  }
  // A phone or card number is not also a «bank account».
  return hits.includes("bank account number") && (hits.includes("phone number") || hits.includes("card number")) ? hits.filter((h) => h !== "bank account number") : hits;
}

export function blockMessage(hits) {
  return `This search was stopped: it contains what looks like a ${[...new Set(hits)].join(" / ")}. Personal details never go to the search company — search again with general words only.`;
}

async function hookMain() {
  let raw = "";
  for await (const c of process.stdin) raw += c;
  let q = "";
  try { q = String(JSON.parse(raw)?.tool_input?.query ?? ""); } catch { /* no query — let it go */ }
  const hits = checkQuery(q);
  if (!hits.length) process.exit(0);
  process.stderr.write(blockMessage(hits));
  process.exit(2);   // Claude Code: exit 2 = block this tool call and show stderr to the model
}
if (process.argv.includes("--hook")) void hookMain();
