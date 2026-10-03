// «Remember this?» card (lib/night-retry.ts): the night answer ends with <<<remember {"text":…}>>>; the screen shows the line with a
// «Remember» button and saves it only when the member presses it (POST /api/memories — same sensitive-word block as typing it).
export const rememberMark = (text: string) => `<<<remember ${JSON.stringify({ text })}>>>`;
const MARK = /<<<remember (\{[^\n]*\})>>>/;
export function readRemember(text: string): string | null {
  const m = MARK.exec(text);
  if (!m) return null;
  try { const t = (JSON.parse(m[1]!) as { text?: unknown }).text; return typeof t === "string" && t.trim().length >= 2 ? t.trim().slice(0, 300) : null; } catch { return null; }
}
