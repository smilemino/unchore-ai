import { describe, expect, it } from "vitest";
import { shadowBlock } from "@/lib/shadow";

// Shadow runs may look things up but never change anything (lib/shadow.ts).
describe("shadow runs only read", () => {
  it("lets reading tools through and blocks the rest", () => {
    expect(shadowBlock("search_my_chats", {})).toBeNull();
    expect(shadowBlock("browser", { action: "open", url: "https://example.com" })).toBeNull();
    expect(shadowBlock("browser", { action: "click", ref: 3 })).toBe("browser click");
    expect(shadowBlock("browser", { action: "type", ref: 1, text: "x" })).toBe("browser type");
    expect(shadowBlock("github", { action: "pr" })).toBe("github");
    expect(shadowBlock("jobs", {})).toBe("jobs");
  });
  it("allows read-only commands in the computer only", () => {
    expect(shadowBlock("computer", { action: "read", path: "wiki/a.md" })).toBeNull();
    expect(shadowBlock("computer", { action: "run", command: "grep -c x wiki/a.md | head -3" })).toBeNull();
    expect(shadowBlock("computer", { action: "write", path: "a" })).toBe("computer write");
    expect(shadowBlock("computer", { action: "run", command: "echo hi > a.txt" })).toBe("a command that writes");
    expect(shadowBlock("computer", { action: "run", command: "find . -name x -delete" })).toBe("a command that writes");
    expect(shadowBlock("computer", { action: "run", command: "curl -X POST https://x" })).toBe("a command that may change something");
    expect(shadowBlock("computer", { action: "run", command: "ls; rm -rf wiki" })).toBe("a command that may change something");
    expect(shadowBlock("computer", { action: "run", command: "cat $(ls)" })).toBe("a command that writes");
    expect(shadowBlock("computer", { action: "run", command: "ls", background: true })).toBe("computer run");
  });
});
