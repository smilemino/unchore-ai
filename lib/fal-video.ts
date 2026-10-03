import { HfError, type HfAskT } from "./hf-ask";

// Videos on the member's OWN fal account with Seedance 2.5 Draft Mode (owner 2026-10-02: «bring the Artlist feature»): a 480p card
// is sent as a draft (draft: true → draft_id); the card's «same shot in 1080p» sends only that draft_id to …/draft/complete, which
// keeps the prompt, length, ratio, seed and sound. Higgsfield has no draft/seed field, so this needs fal. Ported from the AI Soul tool
// /workspace/tools/seedance-draft (same endpoints, checked 2026-10-02: a made-up draft_id → «Invalid, expired, or unauthorized draft ID»).
export const FAL_T2V = "bytedance/seedance-2.5/text-to-video";
export const FAL_DONE = "bytedance/seedance-2.5/draft/complete";
export const FAL_UP = "fal-ai/bytedance-upscaler/upscale/video";
const Q = "https://queue.fal.run/";

async function fal<T>(key: string, url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, { method: body ? "POST" : "GET", headers: { authorization: `Key ${key}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30_000) });
  const raw = await r.text();
  if (r.status === 401 || r.status === 403) throw new HfError("bad_key");
  if (r.status === 402 || /balance|insufficient|exhausted/i.test(raw)) throw new HfError("no_balance");
  if (!r.ok) throw new HfError(r.status === 422 && /draft/i.test(raw) ? "draft_gone" : `http_${r.status}`);
  return JSON.parse(raw || "{}") as T;
}

/** A video card on fal: 480p → a draft (its 1080p can follow); 720p/1080p → made straight. Returns fal's request id. */
export async function falSubmit(key: string, a: Extract<HfAskT, { kind: "video" }>): Promise<string> {
  const draft = a.res === "480p";
  const body = { prompt: a.prompt, duration: String(Math.max(4, a.seconds)), aspect_ratio: a.aspect, codec: "H264", ...(draft ? { draft: true } : { resolution: a.res }) };
  const r = await fal<{ request_id?: string }>(key, Q + FAL_T2V, body);
  if (!r.request_id) throw new HfError("no_request_id");
  return r.request_id;
}

/** «Same shot in 1080p» from a finished draft. */
export async function falFinal(key: string, draftId: string): Promise<string> {
  const r = await fal<{ request_id?: string }>(key, Q + FAL_DONE, { draft_id: draftId, resolution: "1080p", codec: "H264" });
  if (!r.request_id) throw new HfError("no_request_id");
  return r.request_id;
}

/** «Sharper, same video»: ByteDance's upscaler makes a finished video 1080p without redrawing it (preset for AI-made video). */
export async function falUpscale(key: string, videoUrl: string): Promise<string> {
  const r = await fal<{ request_id?: string }>(key, Q + FAL_UP, { video_url: videoUrl, target_resolution: "1080p", enhancement_tier: "standard", enhancement_preset: "aigc", target_fps: 30 });
  if (!r.request_id) throw new HfError("no_request_id");
  return r.request_id;
}

/** «sent» while it's being made, «done» with the file's address (and the draft_id when it was a draft), or «failed». */
export async function falCheck(key: string, model: string, requestId: string): Promise<{ status: "sent" | "done" | "failed"; url?: string; draftId?: string; error?: string }> {
  // Queue lookups use namespace/model; submission subpaths such as /draft/complete return 405 here.
  // Matches the status_url/response_url of the accepted draft, final and upscale requests (2026-10-02).
  const queueModel = model.split("/").slice(0, 2).join("/");
  const base = `${Q}${queueModel}/requests/${encodeURIComponent(requestId)}`;
  const st = await fal<{ status?: string }>(key, `${base}/status`);
  if (st.status !== "COMPLETED") return st.status === "FAILED" || st.status === "ERROR" ? { status: "failed", error: "failed" } : { status: "sent" };
  const r = await fal<{ video?: { url?: string }; draft_id?: string | null }>(key, base).catch((e: unknown) => ({ error: e instanceof HfError ? e.message : "failed" }) as const);
  if ("error" in r) return { status: "failed", error: r.error };
  return r.video?.url ? { status: "done", url: r.video.url, draftId: r.draft_id ?? undefined } : { status: "failed", error: "no_file" };
}

/** Seconds of a card as fal makes it (Seedance 2.5 on fal starts at 4 s). */
export const falSeconds = (a: Extract<HfAskT, { kind: "video" }>) => Math.max(4, a.seconds);
