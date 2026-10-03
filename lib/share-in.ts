// Phone «Share → Unchore» (ported from AI Soul, 2026-09-30 sync): once Unchore is on the home screen it appears in the share menu
// (manifest share_target, Android Chrome). The shared title, text and link fill the new chat's input box — nothing is sent by itself.
export const SHARE_MAX = 8000;
export function sharedText(p: { title?: string | null; text?: string | null; url?: string | null }): string {
  const parts: string[] = [];
  const title = (p.title ?? "").trim(), text = (p.text ?? "").trim(), url = (p.url ?? "").trim();
  if (title && !text.includes(title)) parts.push(title);
  if (text) parts.push(text);
  if (url && !text.includes(url)) parts.push(url);
  return parts.join("\n").slice(0, SHARE_MAX);
}
