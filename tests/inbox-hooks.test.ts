// «Alerts in» (lib/inbox-hooks.ts): what a member's outside service sends becomes one readable note — JSON text fields,
// any other JSON shown as code, plain text as is; card numbers masked before saving; empty bodies refused.
import { describe, expect, it } from "vitest";
import { alertNote, cleanName, hookUrl, incomingText, TEXT_MAX } from "@/lib/inbox-hooks";

describe("alerts in — the words", () => {
  it("takes text / message / content from JSON, with an optional title", () => {
    expect(incomingText(JSON.stringify({ text: "New order #12" }), "application/json")).toBe("New order #12");
    expect(incomingText(JSON.stringify({ message: "Disk 91% full" }), null)).toBe("Disk 91% full");
    expect(incomingText(JSON.stringify({ title: "Server", content: "Back up" }), "application/json")).toBe("**Server**\n\nBack up");
  });
  it("shows any other JSON as code, and plain text as is", () => {
    expect(incomingText(JSON.stringify({ order: 12, total: 30 }), "application/json")).toBe('```json\n{\n  "order": 12,\n  "total": 30\n}\n```');
    expect(incomingText("Backup finished", "text/plain")).toBe("Backup finished");
    expect(incomingText("{not json", "text/plain")).toBe("{not json");
    expect(incomingText(JSON.stringify("just a string"), "application/json")).toBe("just a string");
  });
  it("refuses an empty body and keeps it short", () => {
    expect(incomingText("   ", "text/plain")).toBeNull();
    expect(incomingText(JSON.stringify({ text: "  " }), "application/json")).toBe('```json\n{\n  "text": "  "\n}\n```');
    expect(incomingText("x".repeat(TEXT_MAX + 500), null)!.length).toBe(TEXT_MAX);
  });
  it("masks card numbers before anything is saved", () => {
    const t = incomingText(JSON.stringify({ text: "Paid with 4242 4242 4242 4242" }), "application/json")!;
    expect(t).not.toContain("4242 4242 4242");
    expect(t).toContain("4242");
  });
  it("the note is marked as from outside; names are one short line; the address carries the key only when asked", () => {
    expect(alertNote("My «shop»\n", "hi")).toBe("🔔 «My shop»\n\nhi");
    expect(cleanName("a".repeat(100)).length).toBe(60);
    expect(hookUrl("https://unchore.ai/", "abc")).toBe("https://unchore.ai/api/inbox/abc");
    expect(hookUrl("https://unchore.ai", "abc", "uci_k")).toBe("https://unchore.ai/api/inbox/abc?key=uci_k");
  });
});
