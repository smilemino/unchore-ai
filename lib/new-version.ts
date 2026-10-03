// New version notice (ported from AI Soul, 2026-09-30 sync): a fix that went live doesn't reach a page that is already open
// until it reloads. The page asks /api/health for the live version every minute; if it changed — reload quietly when the page
// is hidden, otherwise show a bar at the top (never in the middle of voice mode or while typing).
export type VersionAction = "none" | "reload" | "banner";
export function versionAction(o: { base: string | null; now: string | null; hidden: boolean; voiceOpen: boolean; typing: boolean }): VersionAction {
  if (!o.base || !o.now || o.base === o.now || o.now === "dev") return "none";
  return o.hidden && !o.voiceOpen && !o.typing ? "reload" : "banner";
}
