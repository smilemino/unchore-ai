// An answer that arrived after voice mode was closed (AI Soul 2026-10-02 a858: the owner waited in silence, closed voice mode,
// and the late answer stayed as text only). Voice mode reads it when opened again in the same chat within 10 minutes.
export const MISSED_MS = 10 * 60_000;
export interface Missed { text: string; conv: string; at: number }
/** Read the missed answer now? Only the same chat, only fresh, only real text. */
export function missedFresh(m: Missed | null, conv: string | null, now: number): boolean {
  return !!m && !!m.text.trim() && m.conv === conv && now - m.at >= 0 && now - m.at < MISSED_MS;
}
