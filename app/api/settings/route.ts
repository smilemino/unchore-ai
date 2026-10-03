import { langCookie } from "@/lib/i18n-server";
import { isLang } from "@/lib/i18n";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isResp, requireUser } from "@/lib/api";
import { q } from "@/lib/db";
import { FACES } from "@/lib/face";
import { callNameAny } from "@/lib/face-words";
import { MAX_LEVEL, syncNudge } from "@/lib/nudge";
import { validTz } from "@/lib/tz";
import { RULES_MAX, keepRules } from "@/lib/rules-history";
import { subCall } from "@/lib/claude-sub";

const Body = z.object({
  name: z.string().max(80).optional(),
  call: z.string().max(300).optional(),   // the first chat's «what should I call you?» answer, as typed (lib/face.ts)
  lang: z.string().refine(isLang).optional(),
  tz: z.string().max(60).refine((t) => validTz(t) !== null).optional(),
  default_model: z.string().max(80).nullable().optional(),
  notify_email: z.boolean().optional(),
  instructions: z.string().max(RULES_MAX).optional(),
  memory_on: z.boolean().optional(),
  memory_write: z.boolean().optional(),
  web_search: z.boolean().optional(),
  claude_connectors: z.boolean().optional(),
  improve: z.boolean().optional(),
  ask_judge: z.boolean().optional(),
  keep_going: z.boolean().optional(),
  plain_gate: z.boolean().optional(),
  theme: z.enum(["auto", "light", "dark", "night"]).optional(),
  face: z.enum(FACES).optional(),
  nudge_level: z.number().int().min(0).max(MAX_LEVEL).optional(),
  nudge_at: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
});

export async function PATCH(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  const d = b.data;
  if (d.instructions !== undefined) await keepRules(u.id, d.instructions);   // earlier version kept (lib/rules-history.ts)
  await q(
    `update users set name = coalesce($2, name), lang = coalesce($3, lang), tz = coalesce($4, tz),
       default_model = case when $5::boolean then $6 else default_model end, notify_email = coalesce($7, notify_email),
       instructions = coalesce($8, instructions), memory_on = coalesce($9, memory_on), web_search = coalesce($10, web_search), theme = coalesce($11, theme), improve = coalesce($12, improve) where id = $1`,
    [u.id, d.name ?? null, d.lang ?? null, d.tz ?? null, d.default_model !== undefined, d.default_model ?? null, d.notify_email ?? null, d.instructions ?? null, d.memory_on ?? null, d.web_search ?? null, d.theme ?? null, d.improve ?? null],
  );
  if (d.ask_judge !== undefined) await q("update users set ask_judge = $2 where id = $1", [u.id, d.ask_judge]);
  if (d.keep_going !== undefined) await q("update users set keep_going = $2 where id = $1", [u.id, d.keep_going]);
  if (d.memory_write !== undefined) await q("update users set memory_write = $2 where id = $1", [u.id, d.memory_write]);
  if (d.plain_gate !== undefined) await q("update users set plain_gate = $2 where id = $1", [u.id, d.plain_gate]);
  if (d.claude_connectors !== undefined) await q("update users set claude_connectors = $2 where id = $1", [u.id, d.claude_connectors]);
  if (d.face || d.nudge_level !== undefined || d.nudge_at) {
    await q("update users set face = coalesce($2, face), nudge_level = coalesce($3, nudge_level), nudge_at = coalesce($4, nudge_at), nudge_changed_at = case when $3::int is null and $4::text is null then nudge_changed_at else now() end where id = $1",
      [u.id, d.face ?? null, d.nudge_level ?? null, d.nudge_at ?? null]);
    if (d.nudge_level !== undefined || d.nudge_at) await syncNudge(u.id);
  }
  // Their answer to «what should I call you?»: the name alone is saved; null = a sentence, the screen hands it to the AI.
  const called = d.call !== undefined ? callNameAny(d.call, u.lang) : undefined;
  if (called) await q("update users set name = $2 where id = $1", [u.id, called]);
  const res = NextResponse.json(called === undefined ? { ok: true } : { ok: true, name: called });
  if (d.lang) res.cookies.set(langCookie(d.lang));
  return res;
}

export async function DELETE() {
  const u = await requireUser();
  if (isResp(u)) return u;
  // Their Claude/ChatGPT plan sign-ins live on the worker, not in this database — sign those out too (best effort).
  await Promise.all((["claude", "chatgpt"] as const).map((p) => subCall("logout", { user: u.id }, 40_000, p).catch(() => null)));
  await q("delete from users where id = $1", [u.id]);
  const res = NextResponse.json({ ok: true });
  res.cookies.delete("uc_s");
  return res;
}
