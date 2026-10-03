"use client";
import { useCallback, useEffect, useState } from "react";
import { TASK_LABEL, noteIsEarlier, progress, type TaskEvent, type TaskRow, type TaskStatus } from "@/lib/conv-tasks";
import { useLang, useT } from "./I18n";

// Tasks inside one chat (AI Soul components/ConversationTasks.tsx · lib/conv-tasks.ts). Above the input: «📋 3 tasks · 2 done»;
// tap → the list, tap a task → its history, «Tell the AI about this task only» and «Drop this task».
// Opening it is optional — the AI splits, carries on and collects the work either way.
const CHIP: Record<TaskStatus, string> = {
  open: "bg-pill text-fg-2", doing: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  waiting: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200", done: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200", dropped: "bg-pill text-muted line-through",
};

export default function ConversationTasks({ conversationId, version, onSay }: {
  conversationId: string | null;
  version: string;                      // changes whenever the chat does — the list is read again
  onSay: (text: string) => void;        // sends a message into the chat
}) {
  const t = useT();
  const lang = useLang();
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [events, setEvents] = useState<TaskEvent[] | null>(null);
  const [say, setSay] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    if (!conversationId) { setTasks([]); return; }
    const r = await fetch(`/api/conversations/${conversationId}/tasks`).catch(() => null);
    if (r?.ok) setTasks(((await r.json()) as { tasks?: TaskRow[] }).tasks ?? []);
  }, [conversationId]);
  const loadEvents = useCallback(async (taskId: string) => {
    if (!conversationId) return;
    const r = await fetch(`/api/conversations/${conversationId}/tasks/${taskId}`).catch(() => null);
    setEvents(r?.ok ? ((await r.json()) as { events?: TaskEvent[] }).events ?? [] : []);
  }, [conversationId]);
  useEffect(() => { const x = setTimeout(() => void load(), 0); return () => clearTimeout(x); }, [load, version]);
  useEffect(() => { const x = setTimeout(() => { setOpen(false); setPick(null); setSay(""); setErr(""); }, 0); return () => clearTimeout(x); }, [conversationId]);
  useEffect(() => { if (!pick) return; const x = setTimeout(() => void loadEvents(pick), 0); return () => clearTimeout(x); }, [pick, loadEvents, version]);

  if (!conversationId || !tasks.length) return null;
  const p = progress(tasks);
  const fresh = tasks.filter((x) => x.pending).length;
  const when = (iso: string) => new Date(iso).toLocaleString(lang, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const who: Record<TaskEvent["by_who"], string> = { ai: t("AI#task"), member: t("You#task"), system: t("App#task") };

  const act = async (task: TaskRow, action: "instruct" | "drop") => {
    const text = say.trim();
    if (action === "instruct" && !text) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch(`/api/conversations/${conversationId}/tasks/${task.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(action === "instruct" ? { action, body: text } : { action }) }).catch(() => null);
      if (!r?.ok) { setErr(t("Couldn't change the task. Try again.")); return; }
      // Recorded first, then said in the chat: the answer to it is the one that handles it (lib/conv-tasks-db.ts stale rule)
      if (action === "instruct") { setSay(""); onSay(t("About the task «{title}» ({key}): {text}", { title: task.title, key: task.task_key, text })); }
      await load(); await loadEvents(task.id);
    } finally { setBusy(false); }
  };

  const btn = "rounded border border-line-2 bg-surface px-2 py-0.5 text-xs hover:bg-hover disabled:opacity-40 shrink-0";
  return (
    <div className="rounded-xl border border-line-soft bg-panel text-sm" data-testid="tasks-panel">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} data-testid="tasks-bar" className="w-full flex items-center gap-2 px-2 py-1.5 text-left text-xs text-muted hover:bg-hover rounded-xl">
        <span aria-hidden>📋</span>
        <span className="font-medium text-fg-2" data-testid="tasks-progress">{t("{done} of {all} tasks done", { done: String(p.done), all: String(p.live) })}{p.failed ? ` · ${t("{n} failed", { n: String(p.failed) })}` : ""}</span>
        {fresh ? <span className="rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 px-1">{t("{n} new notes not handled yet", { n: String(fresh) })}</span> : null}
        <span className="ml-auto whitespace-nowrap">{open ? "▴" : "▾"}</span>
      </button>
      {open ? (
        <ul className="px-2 pb-2 space-y-1" data-testid="tasks-list">
          {tasks.map((task) => (
            <li key={task.id} className="rounded-lg border border-line-soft bg-surface" data-testid="task-row">
              <button type="button" onClick={() => { setPick((x) => (x === task.id ? null : task.id)); setEvents(null); setSay(""); setErr(""); }} aria-expanded={pick === task.id}
                className="w-full flex items-start gap-2 px-2 py-1 text-left hover:bg-hover rounded-lg">
                <span className={`shrink-0 rounded px-1.5 text-xs ${CHIP[task.status]}`} data-testid="task-status">{t(TASK_LABEL[task.status])}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate" data-testid="task-title">{task.title}</span>
                  {task.note ? <span className="block truncate text-xs text-muted" data-testid="task-note">{noteIsEarlier(task) ? t("Earlier result: {text}", { text: task.note }) : task.note}</span> : null}
                  {task.pending ? <span className="block truncate text-xs text-amber-700 dark:text-amber-300">{t("Your new note (not handled yet): {text}", { text: task.pending.body })}</span> : null}
                </span>
              </button>
              {pick === task.id ? (
                <div className="px-2 pb-2 border-t border-line-soft" data-testid="task-detail">
                  <ol className="mt-1 space-y-0.5 text-xs" data-testid="task-events">
                    {(events ?? []).map((e) => (
                      <li key={e.id} className="flex gap-1.5">
                        <span className="text-muted whitespace-nowrap">{when(e.created_at)} · {who[e.by_who]}{e.status ? ` · ${t(TASK_LABEL[e.status])}` : ""}</span>
                        <span className="min-w-0 break-words text-fg-2">{e.body ?? ""}</span>
                      </li>
                    ))}
                    {!events ? <li className="text-muted">…</li> : null}
                  </ol>
                  <div className="mt-1.5 flex gap-1 items-start">
                    <textarea value={say} onChange={(e) => setSay(e.target.value)} rows={2} aria-label={t("Tell the AI about this task only")} placeholder={t("Tell the AI about this task only")}
                      data-testid="task-say" className="flex-1 min-w-0 rounded-lg border border-line bg-surface p-1 text-sm resize-none"
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void act(task, "instruct"); } }} />
                    <div className="flex flex-col gap-1">
                      <button type="button" className={btn} disabled={busy || !say.trim()} onClick={() => void act(task, "instruct")} data-testid="task-say-send">{t("Send")}</button>
                      {task.status !== "dropped" ? <button type="button" className={btn} disabled={busy} onClick={() => void act(task, "drop")} data-testid="task-drop">{t("Drop this task")}</button> : null}
                    </div>
                  </div>
                  {err ? <p className="mt-1 text-xs text-red-600" role="alert">{err}</p> : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
