import { describe, expect, it } from "vitest";
import { SHORTCUT_LIST, menuKeyOf, shortcutOf } from "../lib/shortcuts";

// Same keys as AI Soul (Shell.tsx): Ctrl/⌘+K search · Ctrl/⌘+Shift+O new chat · Ctrl/⌘+Shift+C copy last answer.
const k = (key: string, o: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...o });
describe("keyboard shortcuts", () => {
  it("reads the three keys with Ctrl or ⌘", () => {
    expect(shortcutOf(k("k", { ctrlKey: true }))).toBe("search");
    expect(shortcutOf(k("K", { metaKey: true }))).toBe("search");
    expect(shortcutOf(k("O", { ctrlKey: true, shiftKey: true }))).toBe("new");
    expect(shortcutOf(k("C", { metaKey: true, shiftKey: true }))).toBe("copy-last");
    expect(shortcutOf(k("S", { ctrlKey: true, shiftKey: true }))).toBe("toggle-list");   // AI Soul Shell.tsx
    expect(shortcutOf(k("/", { metaKey: true }))).toBe("help");
    expect(shortcutOf({ ...k("ㅗ", { ctrlKey: true }), code: "Slash" })).toBe("help");      // the slash key read by place, whatever the keyboard language
  });
  it("lists every shortcut it reads in the table", () => {
    expect(SHORTCUT_LIST.map(([keys]) => keys)).toEqual(["Shift + O", "K", "Shift + S", "Shift + C", "/"]);
  });
  it("leaves plain typing, plain Ctrl+C and Alt combos alone", () => {
    expect(shortcutOf(k("k"))).toBeNull();
    expect(shortcutOf(k("c", { ctrlKey: true }))).toBeNull();
    expect(shortcutOf(k("k", { ctrlKey: true, altKey: true }))).toBeNull();
  });
});

describe("chat menu letters (AI Soul title menu P·R·D)", () => {
  it("reads P, R, D and Esc while the menu is open — by key place too, for a Korean keyboard", () => {
    expect(menuKeyOf(k("p"))).toBe("pin");
    expect(menuKeyOf(k("R"))).toBe("rename");
    expect(menuKeyOf({ ...k("ㅇ"), code: "KeyD" })).toBe("delete");
    expect(menuKeyOf({ ...k("ㅔ"), code: "KeyP" })).toBe("pin");
    expect(menuKeyOf(k("Escape"))).toBe("close");
  });
  it("leaves other letters, Ctrl/⌘/Alt combos and typing in a box alone", () => {
    expect(menuKeyOf(k("x"))).toBeNull();
    expect(menuKeyOf(k("d", { ctrlKey: true }))).toBeNull();
    expect(menuKeyOf(k("p", { metaKey: true }))).toBeNull();
    expect(menuKeyOf(k("r", { altKey: true }))).toBeNull();
    expect(menuKeyOf({ ...k("d"), typing: true })).toBeNull();
  });
});

describe("shortcut table button", () => {
  it("the sidebar's Settings row has a ⌨ button that opens the table (AI Soul Shell.tsx)", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("components/Shell.tsx", "utf8");
    const btn = src.split("\n").find((l) => l.includes('data-testid="shortcut-help-open"')) ?? "";
    expect(btn).toContain(">⌨</button>");
    expect(btn).toContain("onClick={() => setHelp(true)}");
    expect(btn).toContain('aria-label={t("Keyboard shortcuts")}');
    expect(btn).toContain("hidden md:block");
  });
});
