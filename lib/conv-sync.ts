// Same chat in another tab or on another device (AI Soul Chat.tsx «다른 탭·폰에서 바꾸면 새로 고침 없이 맞춘다»):
// the page asks for a small stamp of the chat now and then and reloads only when it changed; while an answer started
// elsewhere is being made it also shows the text written so far (conversations.answering_text — lib/turn.ts).

/** Saves the answer-so-far at most once per `gapMs`, one write at a time (a slow write never piles up behind the stream). */
export function draftSaver(save: (text: string) => Promise<unknown>, gapMs = 1500, now: () => number = Date.now): (text: string) => void {
  let last = 0, busy = false;
  return (text) => {
    if (busy || now() - last < gapMs) return;
    busy = true; last = now();
    void Promise.resolve().then(() => save(text)).catch(() => {}).finally(() => { busy = false; });   // even a save that throws at once never breaks the stream
  };
}

type Row = { id?: string; content: string; superseded?: boolean; notes?: string[]; proposal?: { status?: string } | null; files?: unknown[] };

const sig = (ms: Row[]): string => ms.map((m) => `${m.id}:${m.content.length}:${m.superseded ? 1 : 0}:${m.proposal?.status ?? ""}:${m.files?.length ?? 0}`).join("|");

/** The server's list for this chat, or null when the screen should stay as it is: nothing changed, or the screen has a line
 *  the server doesn't know (a failed send with «Send again», a note) that a reload would wipe. Notes shown under an answer stay. */
export function mergeServer<T extends Row>(server: T[], local: T[]): T[] | null {
  if (local.some((m) => !m.id)) return null;
  if (sig(server) === sig(local)) return null;
  const mine = new Map(local.map((m) => [m.id, m]));
  return server.map((m) => { const l = mine.get(m.id); return l?.notes?.length ? { ...m, notes: l.notes } : m; });
}
