// Keyboard shortcuts, same keys as AI Soul (components/Shell.tsx) and the Claude app: Ctrl on Windows, ⌘ on Mac.
//   Ctrl/⌘+K search chats · Ctrl/⌘+Shift+O new chat · Ctrl/⌘+Shift+C copy the last answer ·
//   Ctrl/⌘+Shift+S hide or show the chat list · Ctrl/⌘+/ this list of shortcuts.
export type Shortcut = "search" | "new" | "copy-last" | "toggle-list" | "help";
export const COPY_LAST_EVENT = "unchore:copy-last";

export function shortcutOf(e: { key: string; code?: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }): Shortcut | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  const k = e.key.toLowerCase();
  if (!e.shiftKey && k === "k") return "search";
  if (e.shiftKey && k === "o") return "new";
  if (e.shiftKey && k === "c") return "copy-last";
  if (e.shiftKey && k === "s") return "toggle-list";
  if (!e.shiftKey && (k === "/" || e.code === "Slash")) return "help";
  return null;
}

/** The shortcut table (Ctrl/⌘+/): keys after Ctrl/⌘, and what each does (English; the screen translates). */
export const SHORTCUT_LIST: Array<[string, string]> = [
  ["Shift + O", "New chat"],
  ["K", "Search chats"],
  ["Shift + S", "Hide or show the chat list"],
  ["Shift + C", "Copy the last answer"],
  ["/", "Open or close this list"],
];

/** While a chat's menu (⋯ / ▾) is open, one letter like AI Soul's title menu and the Claude app: P pin · R rename · D delete · Esc close.
 *  Read by key place too (KeyP…), so a Korean or other keyboard layout works; never while typing or with Ctrl/⌘/Alt. */
export type MenuKey = "pin" | "rename" | "delete" | "close";
export function menuKeyOf(e: { key: string; code?: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; typing?: boolean }): MenuKey | null {
  if (e.ctrlKey || e.metaKey || e.altKey || e.typing) return null;
  if (e.key === "Escape") return "close";
  const k = e.code?.startsWith("Key") ? e.code.slice(3).toLowerCase() : e.key.toLowerCase();
  return k === "p" ? "pin" : k === "r" ? "rename" : k === "d" ? "delete" : null;
}
