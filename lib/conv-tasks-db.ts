// Tasks inside one chat — the database side (034 · rules in lib/conv-tasks.ts). Chat text (title, note, body) is locked like messages.
import type { Lang } from "./i18n";
import { tr } from "./i18n-server";
import { one, q } from "./db";
import { lock, unlockOrNull } from "./privacy";
import { MAX_TASKS, decideLine, extractTasks, isFinished, progress, TASK_LABEL, type Refusal, type TaskEvent, type TaskRow, type TaskStatus } from "./conv-tasks";

const COLS = "id, task_key, title, status, note, instr_rev, created_at, updated_at";
const open = <T extends { title: string; note: string | null }>(r: T): T => ({ ...r, title: unlockOrNull(r.title) ?? "", note: unlockOrNull(r.note) });

// What the member said about a task that no AI line has written since (the AI hasn't handled it yet)
const PENDING = `(select json_build_object('body', e.body, 'rev', e.rev, 'at', e.created_at) from conversation_task_events e
    where e.task_id = t.id and e.kind = 'instruct'
      and not exists (select 1 from conversation_task_events a where a.task_id = t.id and a.by_who = 'ai' and a.created_at > e.created_at)
    order by e.created_at desc limit 1) as pending`;

export async function listTasks(convId: string): Promise<TaskRow[]> {
  const rows = await q<TaskRow>(`select ${COLS}, ${PENDING} from conversation_tasks t where t.conversation_id = $1 order by t.created_at, t.task_key`, [convId]);
  return rows.map((r) => ({ ...open(r), pending: r.pending ? { ...r.pending, body: unlockOrNull(r.pending.body) ?? "" } : null }));
}
export async function listEvents(convId: string, taskId: string): Promise<TaskEvent[]> {
  const rows = await q<TaskEvent>("select id, kind, by_who, status, body, created_at from conversation_task_events where conversation_id = $1 and task_id = $2 order by created_at, id", [convId, taskId]);
  return rows.map((e) => ({ ...e, body: unlockOrNull(e.body) }));
}

async function event(t: { userId: string; taskId: string; convId: string }, kind: TaskEvent["kind"], by: TaskEvent["by_who"], status: TaskStatus | null, body: string | null, rev: number | null, messageId: string | null): Promise<void> {
  await q("insert into conversation_task_events(user_id, task_id, conversation_id, kind, by_who, status, body, rev, message_id) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [t.userId, t.taskId, t.convId, kind, by, status, body ? lock(body) : null, rev, messageId]);
}

const why = (lang: Lang, r: Refusal): string => ({
  dropped: tr(lang, "you dropped this task, so it stays dropped — tell the AI about it to open it again"),
  noDrop: tr(lang, "only you can drop a task"),
  stale: tr(lang, "you said something new about it while this answer was being written, so its «done» wasn't taken"),
  noResult: tr(lang, "marked done without a result, so it stays «Working»"),
})[r];

export interface TasksIn { userId: string; convId: string; questionId: string; answerId: string; lines: ReturnType<typeof extractTasks>["lines"]; bad: string[]; lang: Lang;
  /** the chat would be marked done now · the member asked to close it (then left tasks are dropped) */
  wantDone: boolean; memberCloses: boolean }
/** After the answer is saved: records the task lines and says whether «done» may stand. Notes go under the answer. */
export async function recordTasks(o: TasksIn): Promise<{ notes: string[]; blocked: boolean }> {
  const notes: string[] = [];
  if (o.bad.length) notes.push(`📋 ${tr(o.lang, "Task lines not read ({n}) — they need «name | status | title | result»", { n: String(o.bad.length) })}`);
  if (!o.lines.length && !o.wantDone) return { notes, blocked: false };
  const rows = (await q<TaskRow>(`select ${COLS} from conversation_tasks where conversation_id = $1 order by created_at`, [o.convId])).map(open);
  if (!rows.length && !o.lines.length) return { notes, blocked: false };
  // The member said something about a task after this answer's question was sent — this answer didn't see it
  const stale = new Set((await q<{ task_id: string }>(`select distinct e.task_id from conversation_task_events e, messages m
      where m.id = $2 and e.conversation_id = $1 and e.kind = 'instruct' and e.created_at > m.created_at`, [o.convId, o.questionId])).map((r) => r.task_id));
  const byKey = new Map(rows.map((r) => [r.task_key, r]));
  const refused: string[] = [];
  for (const line of o.lines) {
    const row = byKey.get(line.key) ?? null;
    if (!row && byKey.size >= MAX_TASKS) { refused.push(`${line.key}: ${tr(o.lang, "a chat holds at most {n} tasks", { n: String(MAX_TASKS) })}`); continue; }
    const d = decideLine(row, line, { stale: !!row && stale.has(row.id) });
    if (d.refused) refused.push(`${row?.title ?? d.title}: ${why(o.lang, d.refused)}`);
    if (!row) {
      const made = await one<TaskRow>(`insert into conversation_tasks(user_id, conversation_id, task_key, title, status, note, origin_message_id) values ($1, $2, $3, $4, $5, $6, $7)
        on conflict (conversation_id, task_key) do nothing returning ${COLS}`, [o.userId, o.convId, line.key, lock(d.title), d.status, d.note ? lock(d.note) : null, o.answerId]);
      if (!made) continue;   // written by a parallel answer a moment ago
      const t = { userId: o.userId, taskId: made.id, convId: o.convId };
      await event(t, "created", "ai", d.status, d.note, 1, o.answerId);
      if (d.refused) await event(t, "refused", "system", d.status, why(o.lang, d.refused), 1, o.answerId);
      byKey.set(line.key, { ...made, title: d.title, note: d.note });
      continue;
    }
    const t = { userId: o.userId, taskId: row.id, convId: o.convId };
    if (d.changed) {
      await q("update conversation_tasks set title = $2, status = $3, note = $4, updated_at = now() where id = $1", [row.id, lock(d.title), d.status, d.note ? lock(d.note) : null]);
      byKey.set(line.key, { ...row, title: d.title, status: d.status, note: d.note });
    }
    // A refused line doesn't count as the AI having handled the member's newer word (it stays «not handled yet»)
    if (d.refused) await event(t, "refused", "system", d.status, why(o.lang, d.refused), row.instr_rev, o.answerId);
    else if (d.changed || line.note) await event(t, "status", "ai", d.status, d.note, row.instr_rev, o.answerId);
  }
  if (refused.length) notes.push(`📋 ${refused.slice(0, 4).join(" · ")}${refused.length > 4 ? ` (+${refused.length - 4})` : ""}`);
  if (!o.wantDone) return { notes, blocked: false };
  const now = [...byKey.values()];
  const left = now.filter((r) => !isFinished(r.status));
  if (!left.length) return { notes, blocked: false };
  if (o.memberCloses) {
    // The member closed the chat — what's left is dropped (their word comes first; the history stays)
    for (const r of left) {
      await q("update conversation_tasks set status = 'dropped', updated_at = now() where id = $1", [r.id]);
      await event({ userId: o.userId, taskId: r.id, convId: o.convId }, "drop", "system", "dropped", tr(o.lang, "Dropped when you marked the chat done"), r.instr_rev, o.answerId);
    }
    notes.push(`📋 ${tr(o.lang, "You marked the chat done, so {n} unfinished tasks were dropped (their history stays).", { n: String(left.length) })}`);
    return { notes, blocked: false };
  }
  const names = left.slice(0, 5).map((r) => `${r.title} (${tr(o.lang, TASK_LABEL[r.status])})`).join(", ");
  notes.push(`⏳ ${tr(o.lang, "Not marked done — {n} of {all} tasks are still open: {names}", { n: String(left.length), all: String(progress(now).live), names })}`);
  return { notes, blocked: true };
}

/** «Tell the AI about this task only» — raises the task's version and opens it again if it was done, failed or dropped. */
export async function memberInstruct(userId: string, convId: string, taskId: string, body: string): Promise<TaskRow | null> {
  const r = await one<TaskRow>(`update conversation_tasks set instr_rev = instr_rev + 1, status = case when status in ('done', 'failed', 'dropped') then 'open' else status end, updated_at = now()
    where id = $1 and conversation_id = $2 returning ${COLS}`, [taskId, convId]);
  if (!r) return null;
  await event({ userId, taskId: r.id, convId }, "instruct", "member", r.status, body.slice(0, 4000), r.instr_rev, null);
  await q("update conversations set done = false where id = $1", [convId]);
  return open(r);
}

/** «Drop this task» — kept as «dropped», not «done». */
export async function memberDrop(userId: string, convId: string, taskId: string): Promise<TaskRow | null> {
  const r = await one<TaskRow>(`update conversation_tasks set status = 'dropped', updated_at = now() where id = $1 and conversation_id = $2 and status <> 'dropped' returning ${COLS}`, [taskId, convId]);
  if (r) await event({ userId, taskId: r.id, convId }, "drop", "member", "dropped", null, r.instr_rev, null);
  return r ? open(r) : null;
}
