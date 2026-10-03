// Phone «back» = one step up, to the main screen (ported from AI Soul lib/back-nav.ts, 2026-09-30 sync).
// Moving from one app screen to another outside the main screen replaces the history entry instead of adding one,
// so history is always [main, this screen]: back once → main, back again → leave the app.
// Main here is /app with no conversation open (a project filter «?p=» still counts as main).
export const MAIN_PATH = "/app";

export function isMain(pathname: string, search: string): boolean {
  return pathname === MAIN_PATH && !new URLSearchParams(search).has("c");
}

/** App screens that sit under main (not the sign-in page, not /api). */
export function isAppPage(pathname: string): boolean {
  return pathname === MAIN_PATH || pathname.startsWith(`${MAIN_PATH}/`);
}

/** Should following this link replace the current history entry? */
export function replaceOnNavigate(current: { pathname: string; search: string }, href: string, origin: string): boolean {
  if (isMain(current.pathname, current.search)) return false;
  let u: URL;
  try { u = new URL(href, origin); } catch { return false; }
  if (u.origin !== origin || u.pathname.startsWith("/api/")) return false;
  if (u.pathname === current.pathname && u.search === current.search) return false;
  return isAppPage(u.pathname);
}
