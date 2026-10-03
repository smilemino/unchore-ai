// Input box Enter rule (ported from AI Soul lib/composer-enter.ts, 2026-09-30 sync): computers — Enter sends, Shift+Enter adds a line;
// phones and tablets — Enter adds a line, the ↑ button sends (no Shift key there). Enter while composing Korean/Japanese never sends.
export function isPhoneLike(ua: string, touchPoints = 0): boolean {
  return /Android|iPhone|iPod|Mobile/i.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1);   // iPad reports itself as a Mac
}

export function enterSends(e: { key: string; shiftKey: boolean; isComposing: boolean; keyCode: number }, phone: boolean): boolean {
  if (e.key !== "Enter" || e.shiftKey || e.isComposing || e.keyCode === 229) return false;
  return !phone;
}
