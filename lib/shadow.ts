// Shadow runs (moving AI Soul's reminders over, soul chat b83a 2026-10-03): the new reminder runs next to the old one with
// read-only tools — it may look things up but must not change anything outside, so the old place stays the only one doing the work.

/** Commands a shadow run may use in the member's computer: they only read. Anything else is blocked. */
const READ_CMDS = new Set(["cat", "ls", "head", "tail", "grep", "rg", "find", "wc", "jq", "date", "echo", "sort", "uniq", "cut", "stat", "du", "df", "pwd", "file", "tr", "basename", "dirname", "test", "true", "nl", "column"]);
const READ_BROWSER = new Set(["open", "read", "scroll", "back", "screenshot", "close"]);
const READ_TOOLS = new Set(["seo_audit", "ad_check", "search_my_chats"]);

/** null = allowed in a shadow run; otherwise a short name of what was blocked. */
export function shadowBlock(name: string, a: Record<string, unknown>): string | null {
  if (READ_TOOLS.has(name)) return null;
  const action = String(a.action ?? "");
  if (name === "browser") return READ_BROWSER.has(action) ? null : `browser ${action}`;
  if (name === "computer") {
    if (action === "read") return null;
    if (action !== "run" || a.background === true) return `computer ${action}`;
    const c = String(a.command ?? "");
    if (/[>`]|\$\(|\btee\b|\s-(?:delete|exec|execdir|ok|okdir|fprint\w*)\b|\bsort\b[^|;&]*\s-o\b/.test(c)) return "a command that writes";
    const words = c.split(/\|\||&&|;|\||\n/).map((s) => s.trim().split(/\s+/)[0] ?? "").filter(Boolean);
    return words.length && words.every((w) => READ_CMDS.has(w)) ? null : "a command that may change something";
  }
  return name;
}

export const shadowBlocked = (what: string) =>
  `Shadow run — blocked: ${what}. This run may only read (look things up), never change anything. Say what you would have done instead.`;
