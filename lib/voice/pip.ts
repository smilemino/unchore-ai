import { stripVoiceMarks } from "./marker";

type Message = { role: string; content: string; superseded?: boolean; failed?: boolean };
type State = { voice: boolean; hearing: boolean; busy: boolean; heard: string; note: string; messages: readonly Message[] };
const flat = (text: string) => text.replace(/\s+/g, " ").trim();
const tail = (text: string, max: number) => { const chars = Array.from(flat(text)); return chars.length > max ? "…" + chars.slice(-max).join("") : chars.join(""); };
const head = (text: string, max: number) => { const chars = Array.from(flat(text)); return chars.length > max ? chars.slice(0, max).join("") + "…" : chars.join(""); };

/** Existing Android floating window: current words, not the beginning of an old answer.
 * Synced from AI Soul lib/voice-pip.ts: notice first, then the tail of the current reply/heard words/question. */
export function voicePip(v: State): { phase: "off" | "listening" | "thinking" | "speaking"; line: string } {
  if (!v.voice) return { phase: "off", line: "" };
  const phase = v.hearing ? "listening" : v.busy ? "thinking" : "speaking";
  if (v.note.trim()) return { phase, line: head(v.note, 60) };
  const live = v.messages.filter((m) => !m.superseded && !m.failed);
  const last = live.at(-1);
  // A new question with no answer must not make an earlier answer appear to be the current one.
  if (phase === "speaking" && last?.role === "assistant") return { phase, line: tail(stripVoiceMarks(last.content), 60) };
  if (v.hearing && v.heard.trim()) return { phase, line: tail(v.heard, 60) };
  if (v.busy) return { phase, line: tail([...live].reverse().find((m) => m.role === "user")?.content ?? "", 60) };
  return { phase, line: "" };
}
