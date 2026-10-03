import { NextResponse } from "next/server";
import { z } from "zod";
import { isResp, requireUser } from "@/lib/api";
import { one, q } from "@/lib/db";
import { lock, unlock } from "@/lib/privacy";
import { readMemoryNote } from "@/lib/memory";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const { id } = await ctx.params;
  // ?v=1 — the small look an open page takes every few seconds (lib/conv-sync.ts): a stamp that changes when the chat does
  // (a question or answer added, edited, renamed, a choice answered) and the answer written so far while one is being made.
  if (new URL(req.url).searchParams.get("v")) {
    const s = await one<{ v: string; answeringMs: number | null; draft: string | null }>(`select concat_ws('|', md5(c.title), c.answering_since,
        (select count(*) || ':' || count(*) filter (where m.superseded) || ':' || coalesce(max(m.created_at)::text, '') from messages m where m.conversation_id = c.id),
        (select string_agg(p.status, ',' order by p.message_id) from proposals p join messages m on m.id = p.message_id where m.conversation_id = c.id)) as v,
        case when c.answering_since > now() - interval '6 minutes' then (extract(epoch from now() - c.answering_since) * 1000)::int end as "answeringMs",
        case when c.answering_since > now() - interval '6 minutes' then c.answering_text end as draft
      from conversations c where c.id = $1 and c.user_id = $2`, [id, u.id]);
    if (!s) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ v: s.v, answeringMs: s.answeringMs, draft: s.draft ? unlock(s.draft) : null });
  }
  // answeringMs: an answer is still being made (the page that asked may be closed — lib/turn.ts); older than 6 min = died, not shown.
  const conv = await one<{ title: string }>(`select id, title, pinned, project_id, done, model,
      case when answering_since > now() - interval '6 minutes' then (extract(epoch from now() - answering_since) * 1000)::int end as "answeringMs"
    from conversations where id = $1 and user_id = $2`, [id, u.id]);
  if (!conv) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const messages = await q<{ content: string; memory_note: string | null }>(
    `select m.id, m.role, m.content, m.model, m.created_at, m.superseded, m.memory_note,
       (select json_build_object('id', p.id, 'propose', p.propose, 'method', p.method, 'offer', p.offer, 'status', p.status) from proposals p where p.message_id = m.id) as proposal,
       coalesce((select json_agg(json_build_object('id', f.id, 'name', f.name, 'mime', f.mime, 'size', f.size) order by f.created_at) from files f where f.message_id = m.id), '[]'::json) as files,
       coalesce((select json_agg(ga.idx) from google_actions ga where ga.message_id = m.id), '[]'::json) as gdone,
       coalesce((select json_agg(ma.idx) from meta_actions ma where ma.message_id = m.id), '[]'::json) as mdone
     from messages m where m.conversation_id = $1 order by m.created_at`, [id]);
  return NextResponse.json({ conversation: { ...conv, title: unlock(conv.title) }, messages: messages.map(({ memory_note, ...m }) => ({ ...m, content: unlock(m.content), memory: readMemoryNote(memory_note ? unlock(memory_note) : null) })) });
}

const Patch = z.object({ title: z.string().min(1).max(120).optional(), pinned: z.boolean().optional(), done: z.boolean().optional(), projectId: z.string().uuid().nullable().optional(), model: z.string().max(80).nullable().optional(), seen: z.number().int().min(0).max(1_000_000).optional() });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const { id } = await ctx.params;
  const b = Patch.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  const d = b.data;
  // Read up to here (lib/read-marks.ts) — only ever forward, so a slow device can't bring back numbers already read elsewhere.
  if (d.seen !== undefined) await q("update conversations set seen_ai = greatest(seen_ai, $3) where id = $1 and user_id = $2", [id, u.id, d.seen]);
  if (d.projectId) { const p = await one("select 1 from projects where id = $1 and user_id = $2", [d.projectId, u.id]); if (!p) return NextResponse.json({ error: "not_found" }, { status: 404 }); }
  await q(`update conversations set title = coalesce($3, title), titled = titled or $3 is not null, pinned = coalesce($4, pinned), done = coalesce($5, done),
      project_id = case when $6::boolean then $7::uuid else project_id end, model = case when $8::boolean then $9 else model end
    where id = $1 and user_id = $2`, [id, u.id, d.title ? lock(d.title) : null, d.pinned ?? null, d.done ?? null, d.projectId !== undefined, d.projectId ?? null, d.model !== undefined, d.model ?? null]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const { id } = await ctx.params;
  await q("delete from conversations where id = $1 and user_id = $2", [id, u.id]);
  return NextResponse.json({ ok: true });
}
