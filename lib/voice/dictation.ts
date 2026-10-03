/** Keep the typed draft when adding dictation (AI Soul joinSpoken). */
export const joinSpoken = (base: string, spoken: string): string =>
  !spoken ? base : !base.trim() ? spoken : /\s$/.test(base) ? base + spoken : `${base} ${spoken}`;

/** Why the microphone gave nothing — so the member is told what to do instead of the button just going quiet (AI Soul speech.ts FATAL·no-speech). */
export type MicTrouble = "denied" | "blocked" | "no-mic" | "offline" | "no-lang" | "failed" | "silent";
/** Errors that pressing 🎤 again won't fix: the button hides for this visit (if it shows, it must work). */
export const MIC_FATAL: ReadonlySet<MicTrouble> = new Set(["denied", "blocked", "no-mic", "no-lang"]);
/** The browser's error (or none) and what was heard → the trouble to explain, or null when all went fine or the member stopped it. */
export function micTrouble(error: string | undefined, heard: string): MicTrouble | null {
  if (!error) return heard.trim() ? null : "silent";
  if (error === "aborted" || error === "stop-failed") return null;
  if (error === "not-allowed") return "denied";
  if (error === "service-not-allowed" || error === "not-supported") return "blocked";
  if (error === "audio-capture") return "no-mic";
  if (error === "network") return "offline";
  if (error === "language-not-supported") return "no-lang";
  return "failed";
}
