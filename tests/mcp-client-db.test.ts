// MCP servers the member picks (lib/mcp-client.ts — like `claude mcp add`). A fake MCP server and a fake sign-in server, no
// network: replies in JSON and in event-stream form, tools that only read run at once while ones that change things wait for the
// member's «yes», private network addresses are refused, a server with its own sign-in page gets the one-tap link and the way
// back keeps the tokens locked, and — on a real Postgres — one member never sees or uses another's servers. The database part
// is skipped without TEST_DATABASE_URL.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import { checkUrl, dns, parseReply, privateIp, readOnly } from "@/lib/mcp-client";

dns.lookup = async (host: string) => (host.endsWith(".inside.test") ? ["10.0.0.5"] : ["93.184.216.34"]);

type Call = { url: string; method: string; headers: Record<string, string>; body: string };
/** A fake MCP server at https://mcp.example.test/mcp. sse: answer as an event stream. auth: wants «Bearer good» (else 401). */
function fakeServer(o: { sse?: boolean; auth?: string } = {}) {
  const calls: Call[] = [];
  const tools = [
    { name: "search_pages", description: "Search pages", inputSchema: { type: "object" } },
    { name: "create_page", description: "Create a page", inputSchema: { type: "object" } },
    { name: "weird_tool", description: "says it reads", annotations: { readOnlyHint: true } },
  ];
  const f = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    calls.push({ url, method: init.method ?? "GET", headers, body: String(init.body ?? "") });
    const json = (b: unknown, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json", ...extra } });
    if (url === "https://mcp.example.test/.well-known/oauth-protected-resource/mcp") return json({ resource: "https://mcp.example.test/mcp", authorization_servers: ["https://auth.example.test"], scopes_supported: ["read", "write"] });
    if (url === "https://auth.example.test/.well-known/oauth-authorization-server") return json({ authorization_endpoint: "https://auth.example.test/authorize", token_endpoint: "https://auth.example.test/token", registration_endpoint: "https://auth.example.test/register" });
    if (url === "https://auth.example.test/register") return json({ client_id: "client-1" }, 201);
    if (url === "https://auth.example.test/token") {
      const b = new URLSearchParams(String(init.body));
      if (b.get("grant_type") === "authorization_code" && b.get("code") === "the-code" && b.get("code_verifier") && b.get("client_id") === "client-1") return json({ access_token: "good", refresh_token: "r1", expires_in: 3600 });
      return json({ error: "invalid_grant" }, 400);
    }
    if (url !== "https://mcp.example.test/mcp") return new Response("no", { status: 404 });
    if (o.auth && headers.authorization !== `Bearer ${o.auth}`) return new Response("", { status: 401, headers: { "www-authenticate": 'Bearer resource_metadata="https://mcp.example.test/.well-known/oauth-protected-resource/mcp"' } });
    const m = JSON.parse(String(init.body)) as { id?: number; method: string; params?: { name?: string; arguments?: Record<string, unknown> } };
    if (m.id === undefined) return new Response(null, { status: 202 });
    const result = m.method === "initialize" ? { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "fake" } }
      : m.method === "tools/list" ? { tools }
      : m.method === "tools/call" ? { content: [{ type: "text", text: `ran ${m.params?.name} ${JSON.stringify(m.params?.arguments)}` }, { type: "image", data: Buffer.from("png").toString("base64"), mimeType: "image/png" }] }
      : null;
    const msg = { jsonrpc: "2.0", id: m.id, result };
    return o.sse ? new Response(`event: message\ndata: ${JSON.stringify(msg)}\n\n`, { status: 200, headers: { "content-type": "text/event-stream", "mcp-session-id": "s-1" } }) : json(msg, 200, { "mcp-session-id": "s-1" });
  }) as typeof fetch;
  return { f, calls };
}

describe("MCP client (no database)", () => {
  it("reads JSON and event-stream replies, picking our message by id", () => {
    expect(parseReply('{"jsonrpc":"2.0","id":3,"result":{"a":1}}', "application/json", 3)).toMatchObject({ result: { a: 1 } });
    expect(parseReply('event: message\ndata: {"jsonrpc":"2.0","method":"notifications/progress"}\n\nevent: message\ndata: {"jsonrpc":"2.0","id":4,"result":{"b":2}}\n\n', "text/event-stream", 4)).toMatchObject({ result: { b: 2 } });
    expect(parseReply("<html>", "text/html", 1)).toBeNull();
  });

  it("refuses http, keys in the address and private networks", async () => {
    await expect(checkUrl("http://mcp.example.test/mcp")).rejects.toThrow(/https/);
    await expect(checkUrl("https://user:pw@mcp.example.test/mcp")).rejects.toThrow(/saved secret/);
    await expect(checkUrl("https://localhost/mcp")).rejects.toThrow(/private/);
    await expect(checkUrl("https://db.inside.test/mcp")).rejects.toThrow(/private/);
    await expect(checkUrl("https://169.254.169.254/latest")).rejects.toThrow(/private/);
    await expect(checkUrl("https://mcp.example.test/mcp")).resolves.toBeInstanceOf(URL);
    for (const ip of ["10.1.2.3", "127.0.0.1", "192.168.0.1", "172.20.0.1", "100.64.0.1", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) expect(privateIp(ip)).toBe(true);
    for (const ip of ["8.8.8.8", "93.184.216.34", "2606:4700::1111"]) expect(privateIp(ip)).toBe(false);
  });

  it("knows which tools only read", () => {
    expect(readOnly({ name: "search_pages" })).toBe(true);
    expect(readOnly({ name: "notion-fetch" })).toBe(true);
    expect(readOnly({ name: "get_issue" })).toBe(true);
    expect(readOnly({ name: "create_page" })).toBe(false);
    expect(readOnly({ name: "send_message" })).toBe(false);
    expect(readOnly({ name: "list_and_delete" })).toBe(false);
    expect(readOnly({ name: "weird_tool", annotations: { readOnlyHint: true } })).toBe(true);
    expect(readOnly({ name: "get_and_reset", annotations: { readOnlyHint: false } })).toBe(false);
    expect(readOnly({ name: "list_items", annotations: { destructiveHint: true } })).toBe(false);
  });
});

const URL_DB = process.env.TEST_DATABASE_URL;
describe.skipIf(!URL_DB)("MCP servers per member (database)", () => {
  let db: typeof import("@/lib/db");
  let mc: typeof import("@/lib/mcp-client");
  let a = "", b = "";
  beforeAll(async () => {
    const name = `uc_mcp_${randomUUID().slice(0, 8)}`;
    const admin = new pg.Client({ connectionString: URL_DB }); await admin.connect();
    await admin.query(`create database ${name}`);
    await admin.query("do $$ begin create role unchore_member nologin; exception when duplicate_object or unique_violation then null; end $$");
    await admin.end();
    const url = new globalThis.URL(URL_DB!); url.pathname = `/${name}`;
    process.env.DATABASE_URL = url.toString();
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: "pipe" });
    db = await import("@/lib/db");
    mc = await import("@/lib/mcp-client");
    a = (await db.one<{ id: string }>("insert into users(email, tz) values ($1, 'UTC') returning id", [`a-${randomUUID()}@t.test`]))!.id;
    b = (await db.one<{ id: string }>("insert into users(email, tz) values ($1, 'UTC') returning id", [`b-${randomUUID()}@t.test`]))!.id;
  }, 30_000);

  it("connects a server with no sign-in, lists its tools, runs a reading tool, holds a changing one for «yes»", async () => {
    const s = fakeServer({ sse: true });
    const r = await db.asMember(a, () => mc.mcpTool({ userId: a, yes: false }, { action: "connect", server: "Notion", url: "https://mcp.example.test/mcp" }, s.f));
    expect(r.ok).toBe(true);
    expect(r.text).toContain("«notion» is connected — 3 tool(s): search_pages, create_page, weird_tool");
    // initialize, initialized (with the session id the server gave), tools/list
    expect(s.calls.map((c) => JSON.parse(c.body).method)).toEqual(["initialize", "notifications/initialized", "tools/list"]);
    expect(s.calls[1]!.headers["mcp-session-id"]).toBe("s-1");
    const read = await db.asMember(a, () => mc.mcpTool({ userId: a, yes: false }, { action: "call", server: "notion", tool: "search_pages", args: { q: "plan" } }, s.f));
    expect(read).toMatchObject({ ok: true, text: 'ran search_pages {"q":"plan"}\n(picture — attached to the chat)' });
    expect(read.images).toHaveLength(1);
    const held = await db.asMember(a, () => mc.mcpTool({ userId: a, yes: false }, { action: "call", server: "notion", tool: "create_page", args: {} }, s.f));
    expect(held.ok).toBe(false);
    expect(held.text).toContain("«yes»");
    const n = s.calls.length;
    expect((await db.asMember(a, () => mc.mcpTool({ userId: a, yes: true }, { action: "call", server: "notion", tool: "create_page", args: { title: "x" } }, s.f))).ok).toBe(true);
    expect(s.calls.slice(n).some((c) => c.body.includes('"create_page"'))).toBe(true);
    const block = mc.mcpBlock(await db.asMember(a, () => mc.servers(a)));
    expect(block).toContain("- notion: search_pages, create_page, weird_tool");
  });

  it("a server with its own sign-in page: the link, the way back, tokens locked, then it works", async () => {
    const s = fakeServer({ auth: "good" });
    const r = await db.asMember(a, () => mc.mcpTool({ userId: a, yes: false }, { action: "connect", server: "linear", url: "https://mcp.example.test/mcp" }, s.f));
    expect(r.ok).toBe(false);
    expect(r.text).toMatch(/sign in.*\/api\/connect\/mcp\/start\?id=[0-9a-f-]{36}/);
    const id = /id=([0-9a-f-]{36})/.exec(r.text)![1]!;
    const go = new URL(await db.asMember(a, () => mc.startSignIn(a, id, "https://unchore.ai/api/connect/mcp/callback", s.f)));
    expect(go.origin + go.pathname).toBe("https://auth.example.test/authorize");
    expect(go.searchParams.get("client_id")).toBe("client-1");
    expect(go.searchParams.get("code_challenge_method")).toBe("S256");
    expect(go.searchParams.get("resource")).toBe("https://mcp.example.test/mcp");
    expect(go.searchParams.get("scope")).toBe("read write");
    const state = go.searchParams.get("state")!;
    // b can't finish a's sign-in with a's state
    expect(await db.asMember(b, () => mc.finishSignIn(b, state, "the-code", s.f))).toBeNull();
    expect(await db.asMember(a, () => mc.finishSignIn(a, state, "wrong", s.f))).toBeNull();
    expect(await db.asMember(a, () => mc.finishSignIn(a, state, "the-code", s.f))).toBe("linear");
    const raw = await db.one<{ auth: string; oauth_state: string | null }>("select auth, oauth_state from mcp_servers where id = $1", [id]);
    expect(raw!.auth.startsWith("enc:")).toBe(true);
    expect(raw!.auth).not.toContain("good");
    expect(raw!.oauth_state).toBeNull();
    const used = await db.asMember(a, () => mc.mcpTool({ userId: a, yes: false }, { action: "call", server: "linear", tool: "search_pages", args: {} }, s.f));
    expect(used.ok).toBe(true);
    expect(s.calls.at(-1)!.headers.authorization).toBe("Bearer good");
  });

  it("another member sees and uses none of it", async () => {
    const s = fakeServer();
    expect(await db.asMember(b, () => mc.servers(b))).toEqual([]);
    expect(await db.asMember(b, () => db.q("select slug from mcp_servers"))).toEqual([]);
    const r = await db.asMember(b, () => mc.mcpTool({ userId: b, yes: true }, { action: "call", server: "notion", tool: "search_pages" }, s.f));
    expect(r.ok).toBe(false);
    expect(s.calls).toHaveLength(0);
    expect(await db.asMember(b, () => mc.removeServer(b, "notion"))).toBe(false);
    expect((await db.asMember(a, () => mc.servers(a))).map((x) => x.slug).sort()).toEqual(["linear", "notion"]);
  });

  it("a saved key is sent from the member's own vault; a missing one is named; removing needs «yes»", async () => {
    const { seal, hint } = await import("@/lib/crypto");
    await db.asMember(a, () => db.q("insert into vault(user_id, name, enc, hint) values ($1, 'SENTRY_KEY', $2, $3)", [a, seal("good"), hint("good")]));
    const s = fakeServer({ auth: "good" });
    expect((await db.asMember(a, () => mc.addServer(a, { name: "sentry", url: "https://mcp.example.test/mcp", secret: "NOPE" }, s.f))).text).toContain("No saved secret named «NOPE»");
    expect((await db.asMember(a, () => mc.addServer(a, { name: "sentry", url: "https://mcp.example.test/mcp", secret: "SENTRY_KEY" }, s.f))).ok).toBe(true);
    expect(s.calls.every((c) => c.headers.authorization === "Bearer good")).toBe(true);
    // b's server pointing at the same address can't use a's key name
    expect((await db.asMember(b, () => mc.addServer(b, { name: "sentry", url: "https://mcp.example.test/mcp", secret: "SENTRY_KEY" }, s.f))).ok).toBe(false);
    expect((await db.asMember(a, () => mc.mcpTool({ userId: a, yes: false }, { action: "remove", server: "sentry" }, s.f))).ok).toBe(false);
    expect((await db.asMember(a, () => mc.mcpTool({ userId: a, yes: true }, { action: "remove", server: "sentry" }, s.f))).ok).toBe(true);
    expect((await db.asMember(a, () => mc.addServer(a, { name: "x", url: "https://db.inside.test/mcp" }, s.f))).text).toMatch(/private/);
  });
});
