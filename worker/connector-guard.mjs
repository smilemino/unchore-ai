// The member's own claude.ai connectors (Notion, Slack, Drive…) — read-shaped tools only (owner «yes» 2026-10-02 21:40).
// Claude Code calls this as a PreToolUse hook for every «mcp__claude_ai_…» tool (worker/claude.mjs connectorIsolation):
// a tool whose name says search/get/list/fetch/read/query — and says nothing that writes, sends or deletes — is let through;
// everything else is refused. If this hook ever fails to run, Claude Code falls back to asking, and «-p» can't ask — so it is refused too.
import { fileURLToPath } from "node:url";

const READ = new Set(["search", "get", "list", "fetch", "read", "query"]);
const WRITE = /^(create|update|delete|del|remove|rm|send|post|write|edit|add|set|put|patch|move|copy|upload|archive|unarchive|publish|reply|draft|invite|share|schedule|cancel|insert|modify|rename|replace|append|comment|react|mark|label|assign|close|merge|push|trigger|run|execute|exec|approve|submit|duplicate|import|save|sync|enable|disable|activate|deactivate|pause|resume|start|stop|revoke|grant|transfer|pay|book|forward|trash|restore|accept|decline|reject|subscribe|unsubscribe|kick|ban|pin|unpin|star|apply|deploy|install|uninstall|clear|reset|purge|empty|batch|bulk|manage|change|make|do|perform|commit|mutate)$/;

export const CONNECTOR_TOOL = /^mcp__claude_ai_/;

/** Words of a tool name: «notion-search» → [notion, search] · «getPageContent» → [get, page, content]. */
export function toolWords(name) {
  return String(name).replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/** A connector tool may run only if its own part of the name (after «mcp__claude_ai_<Server>__») reads, and never writes. */
export function readOnlyTool(name) {
  if (!CONNECTOR_TOOL.test(String(name))) return false;
  const own = String(name).split("__").slice(2).join("__");
  const w = toolWords(own);
  return w.some((x) => READ.has(x)) && !w.some((x) => WRITE.test(x));
}

/** The hook's answer (Claude Code PreToolUse JSON). */
export function decide(name) {
  const ok = readOnlyTool(name);
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: ok ? "allow" : "deny",
    permissionDecisionReason: ok ? "read-only connector tool" : "Unchore lets connectors only read (search, get, list, fetch, read, query). Tell the member this step needs them to do it in that app." } };
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes("--hook")) {
  let raw = "";
  process.stdin.on("data", (d) => { raw += d; if (raw.length > 1_000_000) raw = raw.slice(0, 1_000_000); });
  process.stdin.on("end", () => {
    let name = "";
    try { name = JSON.parse(raw).tool_name ?? ""; } catch { /* unreadable — refused below */ }
    process.stdout.write(JSON.stringify(decide(name)));
  });
}
