// Unchore tools for Claude Code (Claude plan members): a tiny MCP server over stdio (JSON-RPC 2.0, one message per line).
// Claude Code starts it per answer (claude.mjs --mcp-config). It only lists the tools the app sent for this turn and
// forwards each call to the app (/api/tools/call) with a signed, short-lived turn token — the app runs the tool, checks
// the member's «yes» for irreversible steps and keeps any file it made. No shell, no file access of its own.
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";

const defs = JSON.parse(readFileSync(process.env.UC_TOOL_DEFS ?? "/dev/null", "utf8") || "[]");
const url = process.env.UC_TOOL_URL ?? "";
// The turn token is read at each call from the file claude.mjs writes when the turn comes (a program started ahead has none yet).
const tok = () => (process.env.UC_TOOL_TOKEN_FILE ? (() => { try { return readFileSync(process.env.UC_TOOL_TOKEN_FILE, "utf8").trim(); } catch { return ""; } })() : process.env.UC_TOOL_TOKEN ?? "");
const out = (o) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...o }) + "\n");

async function call(name, args) {
  if (!defs.some((d) => d.name === name)) return { text: `unknown tool ${name}`, isError: true };
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${tok()}` },
    body: JSON.stringify({ name, args: args ?? {} }), signal: AbortSignal.timeout(600_000) }).catch((e) => ({ ok: false, status: 0, json: async () => ({ text: String(e) }) }));
  const j = await r.json().catch(() => ({}));
  return { text: String(j.text ?? `tool failed (${r.status})`), isError: !r.ok || j.ok === false };
}

createInterface({ input: process.stdin }).on("line", async (line) => {
  let m; try { m = JSON.parse(line); } catch { return; }
  if (m.id === undefined) return;   // notifications
  if (m.method === "initialize") return out({ id: m.id, result: { protocolVersion: m.params?.protocolVersion ?? "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "unchore", version: "1" } } });
  if (m.method === "tools/list") return out({ id: m.id, result: { tools: defs.map((d) => ({ name: d.name, description: d.description, inputSchema: d.parameters })) } });
  if (m.method === "tools/call") { const r = await call(m.params?.name, m.params?.arguments); return out({ id: m.id, result: { content: [{ type: "text", text: r.text }], isError: r.isError } }); }
  if (m.method === "ping") return out({ id: m.id, result: {} });
  out({ id: m.id, error: { code: -32601, message: "method not found" } });
});
