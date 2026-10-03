// A finished background job (an app build) said aloud while voice mode is on — one short sentence, never the link
// (AI Soul components/VoiceMode.tsx: «띵» and one sentence when a job left to run finishes).

/** The first sentence of a message, ready to speak: no links, code or marks; at most `max` characters. */
export function announceLine(text: string, max = 140): string {
  const plain = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[#*_>`|~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const first = plain.match(/^.*?[.!?。？！](?=\s|$)/)?.[0] ?? plain;
  return first.length > max ? `${first.slice(0, max - 1).trimEnd()}…` : first;
}

/** Per-device switch in Settings › Device (AI Soul VoiceNotifyToggle): «0» = don't say finished jobs aloud. On unless turned off. */
export const ANNOUNCE_KEY = "uc_voice_announce";
export const announceOn = (stored: string | null): boolean => stored !== "0";

/** Voice mode: an answer still not here after this long gets one spoken line, once per question (AI Soul fd7234df6 — 10/2 the
 *  answers came 15–60 s late on a busy server, the silence read as «it broke» and voice mode was closed). */
export const VOICE_SLOW_MS = 15_000;
export function slowNoteOk(s: { voice: boolean; busy: boolean; sameTurn: boolean; saying: boolean; holding: boolean; typed: string }): boolean {
  return s.voice && s.busy && s.sameTurn && !s.saying && !s.holding && !s.typed.trim();
}

/** A finished job's line while Unchore is talking, an answer is being made or «🎙» is held: keep it and read it at the next
 *  pause instead of dropping it (AI Soul 0b9715f). Only the newest one waits. */
export function announceWaits(s: { saying: boolean; holding: boolean; busy: boolean }): boolean {
  return s.saying || s.holding || s.busy;
}

/** A job left running from voice mode finished: its whole report is read aloud, not just the first sentence (AI Soul f5febae —
 *  «research it fully in the background and tell me all of it; if it's long I'll stop it»). Read whether or not «say finished
 *  jobs aloud» is on (that switch is for jobs started by typing). Code and links are left out, a table row is read as a list,
 *  each line ends as a sentence so the voice pauses. At most `max` characters (the answer the server keeps is about that long). */
export function reportSpeech(md: string, max = 8000): string {
  const lines = md
    .replace(/```[\s\S]*?(```|$)/g, "\n")
    .replace(/<<<[\s\S]*?>>>/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .split("\n")
    .filter((l) => !/^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(l))   // --- rules and |---|---| table lines
    .map((l) => (/^\s*\|.*\|\s*$/.test(l) ? l.split("|").map((c) => c.trim()).filter(Boolean).join(", ") : l))
    .map((l) => l.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "").replace(/[#*_>`|~]/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((l) => (/[.!?。？！:;,…]$/.test(l) ? l : `${l}.`));
  const all = lines.join("\n");
  return all.length > max ? `${all.slice(0, max).replace(/\s+\S*$/, "")}…` : all;
}
