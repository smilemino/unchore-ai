// Spoken «yes» for a step that can't be undone (AI Soul 2619555 · voice approval only after a read-back). In voice mode on a computer
// chat, sending, deleting, publishing or deploying isn't handed to the computer on the first words: the talking AI reads back what
// will be done («You want me to … — right?») with a [[confirm: …]] line, and only a short «yes» to that very answer within
// VOICE_CONFIRM_MS hands it over. Paying is never approved by voice. Several possible targets: the AI asks which one, by number.
import { saidYes } from "../tools/run";

export const VOICE_CONFIRM_MS = 3 * 60_000;   // an old read-back must not be approved by a «yes» meant for something else

const CONFIRM = /^[ \t]*\[\[\s*confirm\s*:\s*([^\]]+?)\s*\]\][ \t]*$/gim;
/** [[confirm: the task in full]] in a voice answer — taken out of the answer, kept for the next spoken «yes». */
export function readConfirm(text: string): { text: string; confirm: string | null } {
  const found = [...text.matchAll(CONFIRM)].map((m) => m[1]!.trim()).filter(Boolean);
  return { text: found.length ? text.replace(CONFIRM, "").replace(/\n{3,}/g, "\n\n").trim() : text, confirm: found.length ? found.join("\n").slice(0, 4000) : null };
}

// The confirm line is written in English (voiceConfirmGuide), so money is caught here in English; the computer is told the same.
const MONEY = /\b(pay|paying|payment|purchase|buy|checkout|check out|order|refund|transfer money|wire|send money|charge|subscribe|invoice|tip|donate)\b|\$|€|£|¥|₩/i;
export function isMoneyTask(task: string): boolean { return MONEY.test(task); }

/** The read-back's task, if the member's words are a short «yes» to it and it is still fresh (otherwise null — answer as usual). */
export function confirmedTask(last: { content: string; voice_confirm: string | null; created_at: string | Date } | null, said: string, now = Date.now()): string | null {
  if (!last?.voice_confirm) return null;
  if (now - new Date(last.created_at).getTime() > VOICE_CONFIRM_MS) return null;
  return saidYes(said, last.content) ? last.voice_confirm : null;
}

/** Work handed over without a read-back: the computer may prepare, but not do anything that can't be undone. */
export const UNCONFIRMED_NOTE = "(Voice mode, not read back: don't send, delete, publish, deploy or pay in this job — prepare it and ask the member in your answer.)";
/** Work the member approved by voice after hearing it read back. */
export function confirmedWork(task: string, said: string): string {
  return `${task}\n\n(The member heard this read back in voice mode and said «${said.trim().slice(0, 80)}» — do exactly this step, nothing more. Never pay or spend money on a spoken yes: ask them to type it.)`;
}

/** Told to the talking AI next to handOffGuide. */
export const voiceConfirmGuide = (name: string) => `## A step that can't be undone needs a read-back
If what they ask «${name}» to do sends, deletes, publishes, deploys, or otherwise can't be taken back, don't write the [[computer: …]] line yet. Say back in one short question what will be done — the exact thing and who or where it goes («You want me to send the draft to Jane — right?») — and add one line on its own:
[[confirm: the task in full, in English — what to do, with the member's own words and anything from this chat it needs]]
Unchore hands it over only if their next words are a short yes within 3 minutes. If it could mean more than one thing (several drafts, files or people), first list them with numbers and ask which one; read back only once it's clear.
Paying, buying, refunds or moving money are never approved by voice: say they need to type that request in this chat.`;
