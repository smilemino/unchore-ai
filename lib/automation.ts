import { asLang } from "@/lib/i18n";
import { tr, trFor } from "@/lib/i18n-server";
import type { Lang } from "@/lib/i18n";
import { chooseModel, complete, providerOf, userKeys } from "./ai";
import { asMember, one, q } from "./db";
import { esc, sendMail } from "./mail";
import { pushUser } from "./push";
import { runRecipe } from "./recipes";
import type { RecipeResult } from "./recipes/types";
import { lock, unlock } from "./privacy";
import { vaultSecret } from "./vault";
import { crossed, goalFor, triedBefore, triedOf, type Tried } from "./reminders";
import { describeSchedule, nextRun } from "./schedule";

/** At most this many automations on at once per member — reminders in chat and ones turned on by hand (AI Soul MAX_ACTIVE).
 *  Over it nothing new turns on; the member is told to pause or delete one. Nothing is turned off for them. */
export const MAX_ACTIVE = 30;
export async function activeCount(userId: string): Promise<number> {
  return (await one<{ n: number }>("select count(*)::int as n from automations where user_id = $1 and status = 'active'", [userId]))?.n ?? 0;
}

export type Automation = {
  after_id?: string | null;
  id: string; user_id: string; title: string; recipe: string; args: Record<string, unknown>; schedule: string;
  condition: { kind: string; value?: number }; status: string; last_value: number | null; last_line: string | null; fail_count: number;
};

type Owner = { email: string; lang: string; tz: string; default_model: string | null; notify_email: boolean };

export function shouldNotify(cond: Automation["condition"], r: RecipeResult, prevLine: string | null): boolean {
  if (!r.ok) return false;
  switch (cond.kind) {
    case "below": return typeof r.value === "number" && typeof cond.value === "number" && r.value < cond.value;
    case "above": return typeof r.value === "number" && typeof cond.value === "number" && r.value > cond.value;
    case "changed": return r.line !== prevLine;
    default: return true;
  }
}

async function ctxFor(userId: string, owner: Owner, dry = false) {
  const keys = await userKeys(userId);
  const model = chooseModel(keys, owner.default_model);
  const ai = model ? (prompt: string) => complete({ model, key: keys[providerOf(model)]!, maxTokens: 900, system: "You are Unchore, a concise personal assistant.", messages: [{ role: "user", content: prompt }] }) : undefined;
  return { lang: asLang(owner.lang), tz: owner.tz || "UTC", ai, dry, secret: (name: string) => vaultSecret(userId, name) };
}

/** Runs once. `dry` = preview for the user (no notification, no schedule change). */
export async function runAutomation(a: Automation, opts: { dry?: boolean; prev?: RunCtxPrev; depth?: number } = {}): Promise<RecipeResult & { notified?: boolean }> {
  const owner = await one<Owner>("select email, lang, tz, default_model, notify_email from users where id = $1", [a.user_id]);
  if (!owner) return { ok: false, why: "no owner" };
  if (a.recipe === "prompt") return runReminder(a, owner);
  const ctx = { ...(await ctxFor(a.user_id, owner, Boolean(opts.dry))), prev: opts.prev };
  const run = await one<{ id: string }>("insert into runs(automation_id) values ($1) returning id", [a.id]);
  const r = await runRecipe(a.recipe, a.args, ctx).catch((e: Error) => ({ ok: false as const, why: e.message.slice(0, 200) }));
  const notify = !opts.dry && owner.notify_email && shouldNotify(a.condition, r, a.last_line);
  let notified = false;
  if (notify && r.ok) void pushUser(a.user_id, { title: a.title, body: r.line, url: "/app/automations", tag: `unchore-auto-${a.id}` });
  if (notify && r.ok) notified = await sendMail(owner.email, `Unchore · ${a.title}`, mailHtml(a, r, ctx.lang), `${a.title}\n${r.line}${r.items ? "\n\n" + r.items.join("\n") : ""}`);
  await q("update runs set finished_at = now(), ok = $2, value = $3, line = $4, why = $5, notified = $6 where id = $1",
    [run!.id, r.ok, r.ok ? r.value ?? null : null, r.ok ? r.line : null, r.ok ? null : r.why, notified]);
  if (!opts.dry) {
    const fails = r.ok ? 0 : a.fail_count + 1;
    // Three misses in a row → «broken»: stop and tell the user, never guess a value.
    const status = fails >= 3 ? "broken" : a.status;
    await q("update automations set last_run_at = now(), last_value = coalesce($2, last_value), last_line = coalesce($3, last_line), fail_count = $4, status = $5, next_run_at = $6 where id = $1",
      [a.id, r.ok ? r.value ?? null : null, r.ok ? r.line : null, fails, status, nextRun(a.schedule, ctx.tz)]);
    if (status === "broken" && a.status !== "broken" && owner.notify_email) {
      const why = r.ok ? "" : r.why;
      await sendMail(owner.email, `Unchore · ${tr(ctx.lang, "{title} paused", { title: a.title })}`,
        `<p>${esc(tr(ctx.lang, "Paused after 3 runs in a row where the value couldn't be read with certainty. Unchore stops rather than send a guess."))}</p><p style="color:#888">${esc(why)}</p>`,
        why);
    }
  }
  if (!opts.dry && r.ok) await runChained(a, r, opts.depth ?? 0);
  return { ...r, notified };
}

type RunCtxPrev = { title: string; line: string; items?: string[] };
const CHAIN_MAX = 5;   // a chain is at most 5 steps deep (PATCH /api/automations/[id] also refuses loops)
/** Skill chain: automations set to «run right after this one» run now, with this result as their input. */
async function runChained(a: Automation, r: RecipeResult & { ok: true }, depth: number) {
  if (depth >= CHAIN_MAX) return;
  const next = await q<Automation>("select id, user_id, title, recipe, args, schedule, condition, status, last_value, last_line, fail_count, after_id from automations where after_id = $1 and user_id = $2 and status = 'active'", [a.id, a.user_id]);
  for (const b of next) await runAutomation(b, { prev: { title: a.title, line: r.line, items: r.items }, depth: depth + 1 }).catch(() => null);
}

function mailHtml(a: Automation, r: RecipeResult & { ok: true }, lang: Lang): string {
  const items = r.items?.length ? `<ul>${r.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : "";
  const src = r.url ? `<p style="color:#888;font-size:12px">${tr(lang, "Source")}: <a href="${esc(r.url)}">${esc(r.url)}</a></p>` : "";
  return `<div style="font-family:system-ui,sans-serif;max-width:560px"><h3 style="margin:0 0 8px">${esc(a.title)}</h3><p style="font-size:16px;padding:12px;background:#f3f1ea;border-radius:8px">${esc(r.line)}</p>${items}${src}<p style="color:#888;font-size:12px">${esc(describeSchedule(a.schedule, { lang, t: trFor(lang) }))} · <a href="https://unchore.ai/app/automations">Unchore</a></p></div>`;
}

/** Scheduler tick: runs due automations (skip-locked so parallel ticks never double-run). */
export async function tick(limit = 20): Promise<{ ran: number; ok: number }> {
  await q("update automations set status = 'done' where status = 'active' and ends_at is not null and ends_at < now()");
  const due = await q<Automation>(
    `update automations set next_run_at = now() + interval '10 minutes'
     where id in (select id from automations where status = 'active' and after_id is null and next_run_at <= now() order by next_run_at limit $1 for update skip locked)
     returning id, user_id, title, recipe, args, schedule, condition, status, last_value, last_line, fail_count`, [limit]);
  let ok = 0;
  for (const a of due) {
    const r = await asMember(a.user_id, () => runAutomation(a)).catch(() => ({ ok: false })); // fenced to its owner (lib/db.ts)
    if (r.ok) ok++;
  }
  return { ran: due.length, ok };
}

/** Reminder turn: ask the user's AI again in the same chat, e-mail the answer. The AI ends it with <<<remind-stop>>>. */
async function runReminder(a: Automation, owner: Owner): Promise<RecipeResult & { notified?: boolean }> {
  const { runTurn } = await import("./turn");
  const args = a.args as { prompt?: string; conversationId?: string; kind?: string; tried?: Tried[] };
  const n = await one<{ n: number }>("select count(*)::int as n from runs where automation_id = $1", [a.id]);
  const run = await one<{ id: string }>("insert into runs(automation_id) values ($1) returning id", [a.id]);
  // The minute timer's run stops at 300 s (app/api/cron/tick maxDuration). An answer still going then is cut here instead, so the run is
  // written down and tried again below — a run that dies with the server stays unfinished and is picked up again 10 minutes later, endlessly.
  const endBy = Date.now() + 280_000;
  const lang = asLang(owner.lang);
  const nudge = args.kind === "nudge";
  const daily = a.schedule.startsWith("daily@") || a.schedule.startsWith("weekly") || a.schedule.startsWith("days@") || a.schedule.startsWith("monthly@") || a.schedule.startsWith("yearly@");   // AI Soul ae6d9e7: a daily run must not stop itself after one day   // the daily note (lib/nudge.ts): Unchore speaks first; only the user ends it
  const text = nudge
    ? `⏰ ☀ ${a.title}\n\n(${args.prompt ?? ""})`
    : `⏰ ${tr(lang, "Reminder#run")} (${describeSchedule(a.schedule, { lang, t: trFor(lang) }, owner.tz || "UTC")} · #${(n?.n ?? 0) + 1}) — ${args.prompt ?? a.title}\n\n(${tr(lang, "Started by a reminder. Do the task and report briefly. If nothing is left to watch, end with <<<remind-stop>>>.")}${daily ? ` ${tr(lang, "This is a daily reminder — finishing today's run is not the end. Stop only when the goal itself is done and there is nothing left for the next run (if unsure, don't stop).")}` : ""})`;
  // Goal reminder (AI Soul build-log «goals» 2026-10-02): measure → missed? one web-searched method not tried before → «Tried:» line; the app keeps the list.
  const w = (a.args as { watch?: { recipe: string; args: Record<string, unknown>; kind: "below" | "above"; value: number } }).watch;
  // A watched price line is never a goal reminder (night 2026-10-03: «goal: Bitcoin price below 82000» would have searched the web for ways to raise Bitcoin once crossed).
  const goal = !nudge ? goalFor(args.prompt ?? "", Boolean(w)) : null;
  const tried = Array.isArray(args.tried) ? args.tried : [];
  const goalText = goal ? `\n\n(${tr(lang, "Goal reminder — goal: {goal}. 1) Measure the number now and say where it came from. 2) If the goal is missed, search the web for ways to raise it, pick ONE method that is not in the list below, say what to change today, and end with one line «Tried: <method> | <source link>». 3) Say whether the last method helped (number before → now; one run is not proof). 4) Stop (<<<remind-stop>>>) only when the goal has been met 7 runs in a row.", { goal })}${tried.length ? `\n${tr(lang, "Tried before:")}\n${tried.slice(-15).map((t) => `- ${t.at} ${t.what}`).join("\n")}` : ""})` : "";
  let r: RecipeResult = { ok: false, why: "not run" };
  let retryAt: Date | null = null;   // the answer failed on every connection: run again soon instead of at the next scheduled time
  let quiet = false;   // the AI answered <<<quiet>>>: nothing to tell this run → no push, no mail
  // A price line (args.watch, set when the reminder was made): read the value here; not crossed → silent, and no AI call at all.
  if (w && !nudge) {
    const v = await runRecipe(w.recipe, w.args, await ctxFor(a.user_id, owner)).catch(() => null);
    if (v?.ok && typeof v.value === "number" && !crossed(w, v.value)) { quiet = true; r = { ok: true, line: v.line }; }
  }
  // A check command (args.gate, owners' computers only): exit 10 → silent and no AI call; otherwise its output rides along as material.
  let gateText = "";
  const g = (a.args as { gate?: { command?: string; secrets?: string[] } }).gate;
  if (g?.command && !nudge && !quiet) {
    const { computerFor, runGate } = await import("./tools/computer");
    if (computerFor(owner.email)) {
      const gr = await runGate(a.user_id, owner.tz || "UTC", g.command, Array.isArray(g.secrets) ? g.secrets.map(String) : []);
      if (gr.skip) { quiet = true; r = { ok: true, line: a.last_line ?? "" }; }
      else gateText = `\n\n«««🔎\n${gr.out}\n»»»`;   // 🔎 = what the check command found (no words → nothing to translate)
    }
  }
  // Shadow run (args.shadow, moving AI Soul's reminders over — the old place still does the real work): the AI answers once with no tools,
  // nothing is posted to the chat, nobody is notified; the answer is kept locked on the reminder for comparing (args.shadow_last).
  const shadow = (a.args as { shadow?: boolean }).shadow === true && !nudge;
  if (shadow) {
    let answer = "";
    if (!quiet) {
      // The member's own AI with read-only tools (lib/shadow.ts), into the shadow chat (args.conversationId) — nobody is notified.
      const meta = await runTurn({ id: a.user_id, lang: owner.lang, tz: owner.tz, default_model: owner.default_model },
        { conversationId: args.conversationId ?? null, text: `${text}${goalText}${gateText}`, reminder: true, shadow: true }, { endBy }).catch((e: Error) => ({ error: e.message }));
      if ("error" in meta) r = { ok: false, why: meta.error.slice(0, 200) };
      else {
        if (meta.quiet) quiet = true;
        answer = meta.quiet ? "" : unlock((await one<{ content: string }>("select content from messages where id = $1", [meta.messageId]))?.content);
        r = { ok: true, line: answer.slice(0, 600) };
      }
    }
    await q("update automations set args = jsonb_set(args, '{shadow_last}', $2::jsonb) where id = $1",
      [a.id, JSON.stringify({ at: new Date().toISOString(), quiet, text: answer ? lock(answer.slice(0, 4000)) : "" })]);
  } else if (!quiet && (a.args as { job?: boolean }).job === true && args.conversationId) {
    // Long work (args.job — owners' reminders moved from AI Soul, e.g. the build diary bakes two videos): a reminder answer gets 240 s
    // inside this 300 s run, so it runs as a background job instead (13 min, lib/bg-jobs.ts). Its result comes into this chat as a note
    // with a notification, so this run itself stays quiet.
    const { startJobs } = await import("./bg-jobs");
    const s = await startJobs({ userId: a.user_id, convId: args.conversationId }, [{ title: a.title, prompt: text + goalText + gateText }]).catch((e: Error) => ({ ok: false, text: e.message }));
    r = s.ok ? { ok: true, line: a.last_line ?? "" } : { ok: false, why: s.text.slice(0, 200) };
    quiet = s.ok;
  } else if (!quiet) try {
    const meta = await runTurn({ id: a.user_id, lang: owner.lang, tz: owner.tz, default_model: owner.default_model }, { conversationId: args.conversationId ?? null, text: text + goalText + gateText, reminder: true }, { endBy });
    // Every connection failed (lib/turn.ts Meta.failed): leave no «couldn't answer» in the chat and run again in 10 minutes — twice at most,
    // then the third failure stays visible so it isn't hidden for good (owner 2026-10-03: this error must not show).
    const again = Number((a.args as { again?: number }).again ?? 0);
    if (meta.failed && again < 2) {
      await q("delete from messages where id = any($1::uuid[])", [[meta.messageId, meta.questionId].filter(Boolean)]);
      retryAt = new Date(Date.now() + 10 * 60_000);
      await q("update automations set args = jsonb_set(args, '{again}', $2::jsonb) where id = $1", [a.id, String(again + 1)]);
      throw new Error(`no AI could answer — trying again at ${retryAt.toISOString()}`);
    }
    if (again) await q("update automations set args = args - 'again' where id = $1", [a.id]);
    if (meta.quiet) quiet = true;
    const ans = meta.quiet ? null : await one<{ content: string }>("select content from messages where id = $1", [meta.messageId]);
    r = { ok: true, line: meta.quiet ? a.last_line ?? "" : unlock(ans?.content).slice(0, 600) };
    const t = goal && !meta.quiet ? triedOf(unlock(ans?.content), new Date().toISOString().slice(0, 10)) : null;
    if (t && !triedBefore(tried, t)) await q("update automations set args = jsonb_set(args, '{tried}', $2::jsonb) where id = $1", [a.id, JSON.stringify([...tried, t].slice(-30))]);
  } catch (e) { r = { ok: false, why: (e as Error).message.slice(0, 200) }; }
  let notified = false;
  const pushed = r.ok && !quiet && !shadow ? await pushUser(a.user_id, { title: `${nudge ? "☀" : "⏰"} ${a.title}`, body: r.line, url: `/app?c=${args.conversationId ?? ""}`, tag: `unchore-rem-${a.id}` }) : 0;
  if (r.ok && !quiet && !shadow && owner.notify_email && !(nudge && pushed)) notified = await sendMail(owner.email, `Unchore · ⏰ ${a.title}`, `<div style="font-family:system-ui,sans-serif;max-width:560px;white-space:pre-wrap">${esc(r.line)}</div><p><a href="https://unchore.ai/app?c=${esc(args.conversationId ?? "")}">Unchore</a></p>`, r.line);
  await q("update runs set finished_at = now(), ok = $2, line = $3, why = $4, notified = $5 where id = $1", [run!.id, r.ok, r.ok ? r.line.slice(0, 300) : null, r.ok ? null : r.why, notified]);
  const cur = await one<{ status: string; ends_at: string | null }>("select status, ends_at from automations where id = $1", [a.id]);
  const once = a.schedule.startsWith("once@");
  const over = once || (cur?.ends_at && new Date(cur.ends_at) <= new Date());
  const fails = r.ok || retryAt ? a.fail_count : a.fail_count + 1;   // a soon retry isn't a broken reminder
  await q("update automations set last_run_at = now(), last_line = $2, fail_count = $3, status = $4, next_run_at = $5 where id = $1",
    [a.id, r.ok ? r.line.slice(0, 300) : a.last_line, r.ok ? 0 : fails, cur?.status === "done" || (over && !retryAt) ? "done" : fails >= 3 ? "broken" : a.status, retryAt ?? nextRun(a.schedule, owner.tz || "UTC")]);
  return { ...r, notified };
}
