import { NextResponse } from "next/server";
import { z } from "zod";
import { isResp, requireUser } from "@/lib/api";
import { one, q } from "@/lib/db";
import { unlock } from "@/lib/privacy";
import { FAL_DONE, FAL_T2V, FAL_UP, falFinal, falSeconds, falSubmit, falUpscale } from "@/lib/fal-video";
import { FAL_KEY_NAME, FINAL_IDX, HfError, KEY_NAME, MAX_USD, MODELS, UP_IDX, falVideoUsd, upscaleUsd, hfPrice, hfSubmit, jobCheck, readHfAsks, saveCheck, type HfAskT } from "@/lib/higgsfield";
import { vaultSecret } from "@/lib/vault";

// An image/video card in an answer (lib/higgsfield.ts). GET: its price on their own account, or how it's going.
// POST: they pressed «Yes» — make it on their account, once. A video card goes to fal when they saved a fal key (lib/fal-video.ts):
// 480p is then a draft, and POST {final: true} makes that same shot in 1080p (row idx 100 + i), once. With a fal key, any finished
// 480p/720p video can also be made sharper without redrawing (POST {upscale: true}, ByteDance's upscaler, row idx 200 + i).
type Job = { status: string; url: string | null; usd: string | null; error: string | null; request_id: string | null; provider: string; model: string; draft_id: string | null; created_at: string };
const DRAFT_DAYS = 7;

async function card(userId: string, messageId: string, i: number): Promise<HfAskT | undefined> {
  const m = await one<{ content: string }>("select m.content from messages m join conversations c on c.id = m.conversation_id where m.id = $1 and c.user_id = $2 and m.role = 'assistant'", [messageId, userId]);
  return m ? readHfAsks(unlock(m.content))[i] : undefined;
}
const errOf = (e: unknown) => (e instanceof HfError ? e.message : "failed");
const getJob = (messageId: string, idx: number) =>
  one<Job>("select status, url, usd, error, request_id, provider, model, draft_id, created_at from hf_jobs where message_id = $1 and idx = $2", [messageId, idx]);
const view = (j: Job) => ({ status: j.status, url: j.url, usd: j.usd == null ? null : Number(j.usd), error: j.error, provider: j.provider, draft: !!j.draft_id });
const draftOpen = (j: Job | null) => !!j && j.provider === "fal" && j.status === "done" && !!j.draft_id && Date.now() - new Date(j.created_at).getTime() < DRAFT_DAYS * 86400_000;

/** A finished video below 1080p can be made sharper (a draft is 480p whatever the card said). */
const upOpen = (j: Job, a: HfAskT) => a.kind === "video" && j.status === "done" && !!j.url && (!!j.draft_id || a.res !== "1080p");
const secondsOf = (j: Job, a: HfAskT) => (a.kind !== "video" ? 0 : j.provider === "fal" ? falSeconds(a) : a.seconds);

async function fresh(userId: string, messageId: string, idx: number): Promise<Job | null> {
  const j = await getJob(messageId, idx);
  if (j?.status !== "sent") return j;
  const r = await jobCheck(userId, j.provider, j.model, j.request_id);
  if (r.status === "sent") return j;
  await saveCheck(messageId, idx, r);
  return getJob(messageId, idx);
}

export async function GET(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const p = new URL(req.url).searchParams;
  const b = z.object({ messageId: z.string().uuid(), i: z.coerce.number().int().min(0).max(20) }).safeParse({ messageId: p.get("messageId"), i: p.get("i") });
  if (!b.success) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  const a = await card(u.id, b.data.messageId, b.data.i);
  if (!a) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const job = await fresh(u.id, b.data.messageId, b.data.i);
  if (job) {
    const fin = await fresh(u.id, b.data.messageId, FINAL_IDX + b.data.i);
    const up = await fresh(u.id, b.data.messageId, UP_IDX + b.data.i);
    const finalUsd = !fin && draftOpen(job) && a.kind === "video" ? falVideoUsd("1080p", falSeconds(a)) : null;
    const upUsd = !up && upOpen(job, a) && (await vaultSecret(u.id, FAL_KEY_NAME)) ? upscaleUsd(secondsOf(job, a)) : null;
    return NextResponse.json({ job: view(job), final: fin ? view(fin) : null, finalUsd, up: up ? view(up) : null, upUsd });
  }
  const falKey = a.kind === "video" ? await vaultSecret(u.id, FAL_KEY_NAME) : null;
  if (falKey && a.kind === "video") return NextResponse.json({ usd: falVideoUsd(a.res, falSeconds(a)), provider: "fal", draft: a.res === "480p" });
  const key = await vaultSecret(u.id, KEY_NAME);
  if (!key) return NextResponse.json({ needKey: true });
  try {
    return NextResponse.json({ usd: await hfPrice(key, a), provider: "higgsfield" });
  } catch (e) {
    return NextResponse.json({ error: errOf(e) });
  }
}

const Body = z.object({ messageId: z.string().uuid(), i: z.number().int().min(0).max(20), final: z.boolean().optional(), upscale: z.boolean().optional() });
export async function POST(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  const { messageId, i } = b.data;
  const a = await card(u.id, messageId, i);
  if (!a) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const falKey = a.kind === "video" ? await vaultSecret(u.id, FAL_KEY_NAME) : null;

  if (b.data.upscale) {   // the same video, sharper (1080p without redrawing)
    const made = await getJob(messageId, i);
    if (!made || !upOpen(made, a) || !falKey) return NextResponse.json({ error: "no_video" }, { status: 400 });
    const usd = upscaleUsd(secondsOf(made, a));
    const claimed = await q("insert into hf_jobs(user_id, message_id, idx, model, provider) values ($1, $2, $3, $4, 'fal') on conflict do nothing returning 1", [u.id, messageId, UP_IDX + i, FAL_UP]);
    if (!claimed.length) return NextResponse.json({ already: true });
    try {
      const rid = await falUpscale(falKey, made.url!);
      await q("update hf_jobs set request_id = $3, usd = $4 where message_id = $1 and idx = $2", [messageId, UP_IDX + i, rid, usd]);
      return NextResponse.json({ ok: true, usd });
    } catch (e) {
      await q("delete from hf_jobs where message_id = $1 and idx = $2", [messageId, UP_IDX + i]);
      return NextResponse.json({ error: errOf(e) }, { status: 502 });
    }
  }

  if (b.data.final) {   // the same shot in 1080p, from a finished draft of this card
    const draft = await getJob(messageId, i);
    if (a.kind !== "video" || !draftOpen(draft) || !falKey) return NextResponse.json({ error: "no_draft" }, { status: 400 });
    const usd = falVideoUsd("1080p", falSeconds(a));
    if (usd > MAX_USD) return NextResponse.json({ error: "too_big" }, { status: 400 });
    const claimed = await q("insert into hf_jobs(user_id, message_id, idx, model, provider) values ($1, $2, $3, $4, 'fal') on conflict do nothing returning 1", [u.id, messageId, FINAL_IDX + i, FAL_DONE]);
    if (!claimed.length) return NextResponse.json({ already: true });
    try {
      const rid = await falFinal(falKey, draft!.draft_id!);
      await q("update hf_jobs set request_id = $3, usd = $4 where message_id = $1 and idx = $2", [messageId, FINAL_IDX + i, rid, usd]);
      return NextResponse.json({ ok: true, usd });
    } catch (e) {
      await q("delete from hf_jobs where message_id = $1 and idx = $2", [messageId, FINAL_IDX + i]);
      return NextResponse.json({ error: errOf(e) }, { status: 502 });
    }
  }

  const key = falKey ? null : await vaultSecret(u.id, KEY_NAME);
  if (!falKey && !key) return NextResponse.json({ error: "not_connected" }, { status: 400 });
  const model = falKey ? FAL_T2V : MODELS[a.kind];
  const claimed = await q("insert into hf_jobs(user_id, message_id, idx, model, provider) values ($1, $2, $3, $4, $5) on conflict do nothing returning 1", [u.id, messageId, i, model, falKey ? "fal" : "higgsfield"]);
  if (!claimed.length) return NextResponse.json({ already: true });
  try {
    let usd: number | null, rid: string;
    if (falKey && a.kind === "video") {
      usd = falVideoUsd(a.res, falSeconds(a));
      if (usd > MAX_USD) throw new HfError("too_big");
      rid = await falSubmit(falKey, a);
    } else {
      // The price again, now: no price → not made (we'd be spending their money blind); over the cap → not made.
      usd = await hfPrice(key!, a);
      if (usd == null) throw new HfError("price_unknown");
      if (usd > MAX_USD) throw new HfError("too_big");
      rid = await hfSubmit(key!, a);
    }
    await q("update hf_jobs set request_id = $3, usd = $4 where message_id = $1 and idx = $2", [messageId, i, rid, usd]);
    return NextResponse.json({ ok: true, usd });
  } catch (e) {
    await q("delete from hf_jobs where message_id = $1 and idx = $2", [messageId, i]);   // not sent → can press again
    return NextResponse.json({ error: errOf(e) }, { status: 502 });
  }
}
