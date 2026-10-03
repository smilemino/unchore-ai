// Several jobs at once, in the background (owner 2026-10-02 «Unchore has to do what Claude Code, Codex and Hermes do» — Claude
// Code's subagents and background tasks, Codex cloud tasks). In a chat the AI can hand off up to 5 pieces of work; each runs as
// its own chat turn (same member, same AI, same tools) in a new chat, all at the same time, while the member keeps talking.
// When one ends, a short note with its result and a link goes back into the chat that started it, with a notification.
// Runs on the member's own AI connection like any answer — nothing on Unchore's account. Jobs can't start more jobs.
import { appUrl } from "./app-url";
import { asMember, one, q } from "./db";
import { lock, unlock } from "./privacy";

export const JOBS_OPEN_MAX = 5;
export const JOB_MINUTES = 13;   // app/api/jobs/run maxDuration is 800 s
const NOTE_MAX = 1500;

export type JobRow = { id: string; title: string; status: string; conversation_id: string | null; created_at: string; finished_at: string | null; note: string | null };

/** Starts each job in its own run (app/api/jobs/run) without waiting; the minute timer picks up any start that got lost. */
export async function kickJob(id: string, base = appUrl()): Promise<void> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return;
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 3000);
  await fetch(`${base}/api/jobs/run?id=${id}`, { method: "POST", headers: { authorization: `Bearer ${secret}` }, signal: c.signal }).catch(() => {});
  clearTimeout(t);
}

export async function startJobs(ctx: { userId: string; convId: string }, list: Array<{ title: string; prompt: string }>, kick: (id: string) => Promise<void> = (id) => kickJob(id)): Promise<{ ok: boolean; text: string }> {
  if (await one("select 1 from bg_jobs where user_id = $1 and conversation_id = $2", [ctx.userId, ctx.convId])) return { ok: false, text: "This chat is itself a background job — do the work here instead of starting more jobs." };
  const jobs = list.map((j) => ({ title: String(j?.title ?? "").replace(/\s+/g, " ").trim().slice(0, 80), prompt: String(j?.prompt ?? "").trim().slice(0, 20_000) })).filter((j) => j.title && j.prompt);
  if (!jobs.length) return { ok: false, text: "Give each job a short title and the full instructions (prompt) — it starts in a new chat that knows nothing else." };
  const open = (await one<{ n: number }>("select count(*)::int as n from bg_jobs where user_id = $1 and status in ('queued', 'running')", [ctx.userId]))?.n ?? 0;
  if (open + jobs.length > JOBS_OPEN_MAX) return { ok: false, text: `At most ${JOBS_OPEN_MAX} background jobs at a time — ${open} still running. Start fewer, or wait for one to end.` };
  const ids: string[] = [];
  for (const j of jobs) {
    const r = await one<{ id: string }>("insert into bg_jobs(user_id, parent_conversation_id, title, prompt) values ($1, $2, $3, $4) returning id", [ctx.userId, ctx.convId, lock(j.title), lock(j.prompt)]);
    ids.push(r!.id);
  }
  await Promise.all(ids.map((id) => kick(id)));
  return { ok: true, text: `Started ${jobs.length} background job(s), running at the same time: ${jobs.map((j, i) => `«${j.title}» (${ids[i]!.slice(0, 8)})`).join(", ")}. Each one ends with a note in this chat; tell the member they can keep going meanwhile.` };
}

export async function listJobs(userId: string, limit = 20): Promise<JobRow[]> {
  const rows = await q<JobRow>("select id, title, status, conversation_id, created_at, finished_at, note from bg_jobs where user_id = $1 order by created_at desc limit $2", [userId, limit]);
  return rows.map((r) => ({ ...r, title: unlock(r.title), note: r.note ? unlock(r.note) : null }));
}

/** The «jobs» tool. */
export async function jobsTool(ctx: { userId: string; convId: string }, a: Record<string, unknown>, kick?: (id: string) => Promise<void>): Promise<{ ok: boolean; text: string }> {
  const action = String(a.action ?? "");
  if (action === "start") return startJobs(ctx, Array.isArray(a.jobs) ? (a.jobs as Array<{ title: string; prompt: string }>) : [], kick);
  if (action === "list") {
    const rows = await listJobs(ctx.userId);
    return { ok: true, text: rows.length ? rows.map((r) => `- ${r.id.slice(0, 8)} «${r.title}» — ${r.status}${r.conversation_id ? ` · /app?c=${r.conversation_id}` : ""}`).join("\n") : "No background jobs yet." };
  }
  if (action === "stop") {
    const id = String(a.id ?? "").trim();
    const r = await one<{ title: string }>("update bg_jobs set status = 'stopped', finished_at = now() where user_id = $1 and status in ('queued', 'running') and id::text like $2 || '%' and length($2) >= 8 returning title", [ctx.userId, id]);
    return r ? { ok: true, text: `Stopping «${unlock(r.title)}».` } : { ok: false, text: "No running job with that id (list shows them)." };
  }
  return { ok: false, text: `Unknown action «${action}» — use start, list or stop.` };
}

type Runner = (user: { id: string; lang: string; tz: string; default_model: string | null }, d: { conversationId: string | null; projectId: string | null; text: string }, o: { signal: AbortSignal; alone?: boolean }) => Promise<{ conversationId: string; messageId: string; text?: string }>;

/** Runs one job to its end (app/api/jobs/run). System work: claims the row on the owner connection, then works fenced to the member. */
export async function runJob(id: string, run?: Runner): Promise<"done" | "failed" | "stopped" | "skipped"> {
  const job = await one<{ id: string; user_id: string; parent_conversation_id: string; title: string; prompt: string }>(
    "update bg_jobs set status = 'running', started_at = now() where id = $1 and status = 'queued' returning id, user_id, parent_conversation_id, title, prompt", [id]);
  if (!job) return "skipped";
  const user = await one<{ id: string; lang: string; tz: string; default_model: string | null }>("select id, lang, tz, default_model from users where id = $1", [job.user_id]);
  if (!user) return "skipped";
  const title = unlock(job.title);
  const ac = new AbortController();
  const watch = setInterval(() => { void one<{ s: string }>("select status as s from bg_jobs where id = $1", [id]).then((r) => { if (r?.s === "stopped") ac.abort(); }).catch(() => {}); }, 4000);
  const cap = setTimeout(() => ac.abort(), JOB_MINUTES * 60_000 - 30_000);
  let status: "done" | "failed" | "stopped" = "done", result = "", child: string | null = null, why = "";
  try {
    const runner = run ?? (await import("./turn")).runTurn as unknown as Runner;
    // The job's own chat is made first and written on the job, so a job can't start more jobs (startJobs looks for it).
    child = await asMember(user.id, async () => {
      const parent = await one<{ project_id: string | null }>("select project_id from conversations where id = $1", [job.parent_conversation_id]);
      return (await one<{ id: string }>("insert into conversations(user_id, title, titled, project_id) values ($1, $2, true, $3) returning id", [user.id, lock(`⚙ ${title}`), parent?.project_id ?? null]))!.id;
    });
    await q("update bg_jobs set conversation_id = $2 where id = $1", [id, child]);
    const text = `${unlock(job.prompt)}\n\n(Background job «${title}», started from another chat. Do the whole job yourself now — nobody is here to answer questions — and end with a short summary of what you did and found.)`;
    const meta = await asMember(user.id, () => runner(user, { conversationId: child, projectId: null, text }, { signal: ac.signal, alone: true }));
    result = meta.text ?? unlock((await asMember(user.id, () => one<{ content: string }>("select content from messages where id = $1", [meta.messageId])))?.content);
  } catch (e) {
    status = "failed"; why = (e as Error).message.slice(0, 200);
    if (why === "no_key") why = (await import("./i18n-server")).tr(user.lang, "Connect your AI first in Unchore → Settings, then write here again.");   // TurnError code, never shown as is
  } finally { clearInterval(watch); clearTimeout(cap); }
  const now = await one<{ s: string }>("select status as s from bg_jobs where id = $1", [id]);
  if (now?.s === "stopped") status = "stopped";
  else if (ac.signal.aborted && status === "done") { status = "failed"; why = why || `didn't finish within ${JOB_MINUTES} minutes`; }
  await q("update bg_jobs set status = $2, conversation_id = coalesce($3, conversation_id), note = $4, finished_at = coalesce(finished_at, now()) where id = $1", [id, status, child, lock(status === "done" ? result.slice(0, NOTE_MAX) : why || status)]);
  await postNote(user, job.parent_conversation_id, title, status, result, child, why);
  return status;
}

/** The note in the chat that started the job: what came of it, and a link to the whole result. */
async function postNote(user: { id: string; lang: string }, parent: string, title: string, status: string, result: string, child: string | null, why: string): Promise<void> {
  const { tr } = await import("./i18n-server");
  const short = result.trim().length > NOTE_MAX ? `${result.trim().slice(0, NOTE_MAX)}…` : result.trim();
  const head = status === "done" ? tr(user.lang, "✅ Background job «{title}» is done.", { title })
    : status === "stopped" ? tr(user.lang, "■ Background job «{title}» was stopped.", { title })
    : tr(user.lang, "⚠ Background job «{title}» couldn't finish: {why}", { title, why });
  const text = [head, status === "done" ? short : "", child ? `[${tr(user.lang, "Open the whole result")}](/app?c=${child})` : ""].filter(Boolean).join("\n\n");
  await asMember(user.id, async () => {
    if (!(await one("select 1 from conversations where id = $1", [parent]))) return;
    await q("insert into messages(conversation_id, role, content, model, asks) values ($1, 'assistant', $2, 'unchore', $3)", [parent, lock(text), status !== "done"]);
    await q("update conversations set updated_at = now(), done = false where id = $1", [parent]);
  });
  const { pushUser } = await import("./push");
  await pushUser(user.id, { title: "Unchore", body: head, url: `/app?c=${parent}`, tag: `unchore-job-${parent}` }).catch(() => 0);
}

/** Minute timer: start jobs whose start got lost; a job past its time that never reported is closed with a note. */
export async function jobTick(kick: (id: string) => Promise<void> = (id) => kickJob(id)): Promise<{ kicked: number; closed: number }> {
  const waiting = await q<{ id: string }>("select id from bg_jobs where status = 'queued' and created_at < now() - interval '1 minute' order by created_at limit 20");
  await Promise.all(waiting.map((w) => kick(w.id)));
  const lost = await q<{ id: string; user_id: string; parent_conversation_id: string; title: string }>(
    `update bg_jobs set status = 'failed', finished_at = now(), note = $1 where status = 'running' and started_at < now() - interval '${JOB_MINUTES + 2} minutes'
     returning id, user_id, parent_conversation_id, title`, [lock("stopped answering")]);
  for (const l of lost) {
    const user = await one<{ id: string; lang: string }>("select id, lang from users where id = $1", [l.user_id]);
    if (user) await postNote(user, l.parent_conversation_id, unlock(l.title), "failed", "", null, "it stopped answering").catch(() => {});
  }
  return { kicked: waiting.length, closed: lost.length };
}

export const JOBS_GUIDE = [
  "## Background jobs (the «jobs» tool)",
  "When the member asks for several separate pieces of work, or one long piece while they keep chatting, start them as background jobs (up to 5 at once) instead of doing them one by one here.",
  "Each job starts in a new chat that knows nothing else: write its prompt as complete instructions (what to do, every detail and file name needed, what to hand back).",
  "Say in one line what you started; each job's result comes back into this chat by itself. Small quick things: just do them here.",
].join("\n");
