// Tasks inside one chat (AI Soul lib/conversation-tasks.ts · owner 2026-10-02 — Claude-project «threads» in one chat). A member hands
// several jobs to one chat; the AI ends its answer with a <<<tasks>>> block, lib/conv-tasks-db.ts copies the lines into
// conversation_tasks (034) and the bar above the input shows «3 tasks · 2 done» (components/ConversationTasks.tsx).
// Four rules: ① a task left → the chat isn't marked done ② «done» needs a result line ③ «done» written before the member's newer word
// on that task is not taken ④ only the member drops a task (the AI can't drop one to slip past rule ①).
// Only the rules live here (no database) so they test easily.
import { k } from "./i18n";

export type TaskStatus = "open" | "doing" | "waiting" | "done" | "failed" | "dropped";
export const TASK_LABEL: Record<TaskStatus, string> = { open: k("To do#task"), doing: k("Working#task"), waiting: k("Waiting#task"), done: k("Done#task"), failed: k("Failed#task"), dropped: k("Dropped#task") };
const WORD_TO: Record<string, TaskStatus> = {
  open: "open", todo: "open", "to do": "open",
  doing: "doing", working: "doing", "in progress": "doing",
  waiting: "waiting",
  done: "done", finished: "done", complete: "done",
  failed: "failed", blocked: "failed",
  dropped: "dropped", cancelled: "dropped", canceled: "dropped",
};
/** Finished = done or dropped. A failed task is still open: the AI tries again or the member drops it. */
export const isFinished = (s: TaskStatus): boolean => s === "done" || s === "dropped";
/** A task the member spoke to again (pending) still shows the AI's last note — as the earlier result, not the current one (AI Soul 1b5d01c). */
export const noteIsEarlier = (r: Pick<TaskRow, "note" | "pending">): boolean => !!(r.note && r.pending);

export interface TaskLine { key: string; status: TaskStatus; title: string; note: string }
export interface TaskRow {
  id: string; task_key: string; title: string; status: TaskStatus; note: string | null; instr_rev: number; created_at: string; updated_at: string;
  /** What the member last said about this task, when the AI hasn't written the task since. */
  pending?: { body: string; rev: number; at: string } | null;
}
export interface TaskEvent { id: string; kind: "created" | "status" | "instruct" | "drop" | "refused"; by_who: "ai" | "member" | "system"; status: TaskStatus | null; body: string | null; created_at: string }

// <<<tasks>>> … <<<endtasks>>> — one task a line: name | status | title | progress or result
export const TASK_BLOCK = /<<<tasks>>>[ \t]*\n?([\s\S]*?)<<<endtasks>>>[ \t]*\n?/g;
const KEY_RE = /^[a-z0-9][a-z0-9-]{0,15}$/;
export const MAX_TASKS = 20;   // per chat — new names past this are not taken

/** Takes the task blocks out of an answer. Lines that can't be read go to `bad`. The same name twice: the later line wins. */
export function extractTasks(text: string): { lines: TaskLine[]; content: string; bad: string[] } {
  const found = new Map<string, TaskLine>(); const bad: string[] = [];
  const content = text.replace(TASK_BLOCK, (_m, body: string) => {
    for (const raw of body.split("\n")) {
      const line = raw.trim().replace(/^[-*·]\s*/, "");
      if (!line) continue;
      const parts = line.split("|").map((x) => x.trim());
      const key = (parts[0] ?? "").toLowerCase();
      const status = WORD_TO[(parts[1] ?? "").toLowerCase().replace(/\s+/g, " ")];
      if (!KEY_RE.test(key) || !status) { bad.push(line.slice(0, 80)); continue; }
      found.set(key, { key, status, title: (parts[2] ?? "").slice(0, 200), note: parts.slice(3).join(" | ").slice(0, 1000) });
    }
    return "";
  });
  if (content === text) return { lines: [], content: text, bad };
  return { lines: [...found.values()], content: content.replace(/\n{3,}/g, "\n\n").replace(/\s+$/, ""), bad };
}

export type Refusal = "dropped" | "noDrop" | "stale" | "noResult";
export interface Decision { status: TaskStatus; title: string; note: string | null; refused: Refusal | null; changed: boolean }
/** One line against the task as recorded. stale = the member said something new about this task after this answer's question. */
export function decideLine(row: Pick<TaskRow, "status" | "title" | "note"> | null, line: TaskLine, o: { stale: boolean }): Decision {
  const title = line.title && line.title !== "-" ? line.title : row?.title || line.key;
  const note = line.note || null;
  const cur: TaskStatus = row?.status ?? "open";
  const refuse = (status: TaskStatus, why: Refusal): Decision => ({ status, title: row ? row.title : title, note: row?.note ?? null, refused: why, changed: !row || status !== cur });
  if (row?.status === "dropped") return refuse("dropped", "dropped");
  if (line.status === "dropped") return refuse(cur, "noDrop");
  if (line.status === "done" && o.stale) return refuse(cur, "stale");
  if (line.status === "done" && !note && cur !== "done") return refuse("doing", "noResult");
  if (line.status === "done" && !note) return { status: "done", title, note: row?.note ?? null, refused: null, changed: title !== row?.title };
  return { status: line.status, title, note, refused: null, changed: !row || cur !== line.status || (row.note ?? null) !== note || row.title !== title };
}

export interface Progress { live: number; done: number; failed: number; dropped: number; left: number }
export function progress(rows: Array<Pick<TaskRow, "status">>): Progress {
  const n = (s: TaskStatus) => rows.filter((r) => r.status === s).length;
  return { live: rows.length - n("dropped"), done: n("done"), failed: n("failed"), dropped: n("dropped"), left: rows.filter((r) => !isFinished(r.status)).length };
}

/** For the AI — every answer: how to write tasks. */
export const TASKS_GUIDE = [
  "## Several jobs in one chat",
  "When the user hands you two or more separate jobs in this chat, or one job with clear separate parts, keep a task list: at the very end of the answer write",
  "<<<tasks>>>",
  "t1 | doing | Short title | where it stands or the result in one line",
  "<<<endtasks>>>",
  "One line per task whose state changed in this answer. Name: t1, t2 … (keep a task's name). Status: open, doing, waiting, done, failed. «done» needs the result or proof in the last part. The app hides the block and shows the list above the input. While a task is not done, the chat is not marked done — finish it, or ask whether to drop it (only the user can drop a task). Plain questions and single quick jobs need no list.",
].join("\n");

/** For the AI — this chat's tasks, when it has some. A record, not instructions from the user. */
export function taskPromptNote(rows: TaskRow[]): string {
  if (!rows.length) return "";
  const p = progress(rows);
  const lines = rows.map((r) => `- ${r.task_key} [${r.status}] ${r.title}${r.note ? ` — ${r.note.slice(0, 160)}` : ""}${r.pending ? `\n  ★The user said about this task (not handled yet): «${r.pending.body.slice(0, 400)}»` : ""}`);
  return `## This chat's tasks (${p.done} of ${p.live} done)\n${lines.join("\n")}\nWrite only the tasks whose state changes, in a <<<tasks>>> block. A task the user spoke about again: redo it as they said and write the new result.`;
}
