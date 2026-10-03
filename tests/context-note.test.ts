import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// «📝 Long chat … · View summary» above an answer (AI Soul ContextNote): the summary opens read-only, from the member's own chat only.
const src = (f: string) => readFileSync(f, "utf8");

describe("long-chat summary line", () => {
  it("the summary is read from the member's own chat and never changed there", () => {
    const lib = src("lib/chat-summary.ts");
    expect(lib).toMatch(/where id = \$1 and user_id = \$2/);
    expect(lib).not.toMatch(/\b(update|delete|insert)\b/i);
    const route = src("app/api/conversations/[id]/summary/route.ts");
    expect(route).toMatch(/requireUser\(\)/);
    expect(route).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/);
  });
  it("shows above the answer that summarized, with «View summary», and a failed load is tried again", () => {
    const chat = src("components/Chat.tsx");
    expect(chat).toMatch(/summarized: meta\.context\?\.summarized/);
    expect(chat).toMatch(/<ContextNote conversationId=\{convId\} summarized=\{m\.summarized\} \/>/);
    const note = src("components/ContextNote.tsx");
    expect(note).toMatch(/t\("View summary"\)/);
    expect(note).toMatch(/body\?\.ok/);
  });
});
