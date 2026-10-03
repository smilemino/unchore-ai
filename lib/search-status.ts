// «Searching the web…» while the AI searches (AI Soul lib/progress-stage.ts — the live «what it is doing now» line).
// The web tools of Claude Code (Claude plan, worker/claude.mjs «\u0002name\u0002») and of the Anthropic API (key, server tools)
// start the line; the next words of the answer take it away, so it never stays up after the search is done.
const KIND: Record<string, "search" | "read"> = { WebSearch: "search", web_search: "search", WebFetch: "read", web_fetch: "read" };

export function searchLine(send: (s: string) => void, label: (kind: "search" | "read") => string) {
  let on = false;
  return {
    /** true = a web tool, its line is shown; false = not a web tool (the caller shows its own line). */
    tool(name: string): boolean {
      const k = KIND[name];
      if (!k) return false;
      on = true;
      send(`\u0001${label(k)}\u0001`);
      return true;
    },
    /** Answer words came: the search line goes. */
    text() { if (on) { on = false; send("\u0001\u0001"); } },
  };
}
