// Unsent attachments stay with the chat's draft on this device (ported from AI Soul components/draft.ts, 2026-09-30 sync —
// the owner asked on 2026-09-25 that attached files survive a reload like the typed text does). Only the chip (id, name, size) is kept;
// the file itself is already on the server.
export type DraftFile = { id: string; name: string; mime: string; size: number };
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const key = (convId: string | null) => `uc_draft_files:${convId ?? "new"}`;

export function readDraftFiles(s: Store, convId: string | null): DraftFile[] {
  try {
    const v = JSON.parse(s.getItem(key(convId)) ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter((f): f is DraftFile => !!f && typeof f === "object" && typeof (f as DraftFile).id === "string" && typeof (f as DraftFile).name === "string").slice(0, 20) : [];
  } catch { return []; }
}

export function writeDraftFiles(s: Store, convId: string | null, files: DraftFile[]): void {
  if (files.length) s.setItem(key(convId), JSON.stringify(files.slice(0, 20).map(({ id, name, mime, size }) => ({ id, name, mime, size }))));
  else s.removeItem(key(convId));
}
