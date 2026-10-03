import { tr } from "./i18n-server";
import { one, q } from "./db";
import { pushUser } from "./push";
import { vaultSecret } from "./vault";
import { FAL_KEY_NAME, HfError, KEY_NAME, MODELS, hfBody, perSecondFrom, type HfAskT } from "./hf-ask";
import { falCheck } from "./fal-video";
export * from "./hf-ask";

const API = "https://api.higgsfield.ai";

// Images and videos on the member's OWN Higgsfield account (owner 2026-10-02: «when a member asks for a
// video, make it on their Higgsfield account right away»). The bill goes to their Higgsfield balance — Unchore pays nothing and adds nothing. The answer proposes one shot per
// <<<hf {json}>>> line; the screen shows a card with the price; /api/connect/higgsfield/act makes it only after «Yes», once (hf_jobs).
// Ported from the AI Soul tool /workspace/tools/higgsfield (same API, same «no price → don't make it» rule).
async function hf<T>(key: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(API + path, { method: body ? "POST" : "GET", headers: { authorization: `Key ${key}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30_000) });
  const raw = await r.text();
  if (r.status === 401 || r.status === 403) throw new HfError("bad_key");
  if (r.status === 402 || /balance|insufficient/i.test(raw)) throw new HfError("no_balance");
  if (!r.ok) throw new HfError(`http_${r.status}`);
  return JSON.parse(raw || "{}") as T;
}

/** What this card costs on their account, in dollars — null when Higgsfield's price can't be read (then it isn't made). */
export async function hfPrice(key: string, a: HfAskT): Promise<number | null> {
  const model = MODELS[a.kind];
  const e = await hf<{ usd?: string | number; pricing_description?: string }>(key, `/estimate/${model}`, hfBody(a));
  const n = Number(e.usd);
  if (e.usd != null && Number.isFinite(n)) return n;
  if (a.kind !== "video" || !e.pricing_description) return null;
  const per = perSecondFrom(e.pricing_description)[a.res];
  return per ? Math.round(per * a.seconds * 10_000) / 10_000 : null;
}

export async function hfSubmit(key: string, a: HfAskT): Promise<string> {
  const r = await hf<{ request_id?: string }>(key, `/${MODELS[a.kind]}`, hfBody(a));
  if (!r.request_id) throw new HfError("no_request_id");
  return r.request_id;
}

type HfStatus = { status?: string; images?: { url?: string }[]; video?: { url?: string } | string };
/** «sent» while it's being made, «done» with the file's address, or «failed». */
export async function hfCheck(key: string, requestId: string): Promise<{ status: "sent" | "done" | "failed"; url?: string; error?: string }> {
  const r = await hf<HfStatus>(key, `/requests/${encodeURIComponent(requestId)}/status`);
  if (r.status === "completed") {
    const url = typeof r.video === "string" ? r.video : r.video?.url ?? r.images?.find((x) => x.url)?.url;
    return url ? { status: "done", url } : { status: "failed", error: "no_file" };
  }
  if (r.status === "failed" || r.status === "nsfw" || r.status === "canceled") return { status: "failed", error: r.status };
  return { status: "sent" };
}

/** The minute tick: ask Higgsfield/fal about cards still being made; when one is done, tell the member (their phone). */
export async function hfTick(): Promise<{ done: number; failed: number }> {
  const rows = await q<{ user_id: string; message_id: string; idx: number; request_id: string | null; created_at: string; conv: string; provider: string; model: string }>(
    `select j.user_id, j.message_id, j.idx, j.request_id, j.created_at, m.conversation_id as conv, j.provider, j.model from hf_jobs j join messages m on m.id = j.message_id
      where j.status = 'sent' order by j.created_at limit 20`);
  let done = 0, failed = 0;
  for (const j of rows) {
    const old = Date.now() - new Date(j.created_at).getTime() > 3 * 3600_000;
    const r = await jobCheck(j.user_id, j.provider, j.model, j.request_id);
    if (r.status === "sent" && !old) continue;
    const fin = r.status === "sent" ? { status: "failed" as const, error: "timeout" } : r;
    await saveCheck(j.message_id, j.idx, fin);
    if (fin.status === "done") {
      done++;
      const lang = (await one<{ lang: string }>("select lang from users where id = $1", [j.user_id]).catch(() => null))?.lang ?? "en";
      const title = j.provider === "fal" ? tr(lang, "Your video is ready") : tr(lang, "Your Higgsfield file is ready");
      await pushUser(j.user_id, { title, body: tr(lang, "Open the chat to watch and download it."), url: `/app?c=${j.conv}`, tag: `hf-${j.message_id}-${j.idx}` }).catch(() => 0);
    } else failed++;
  }
  return { done, failed };
}

type Check = { status: "sent" | "done" | "failed"; url?: string; draftId?: string; error?: string };
/** How one card is going, on whichever account made it (a failed look-up counts as «still being made»). */
export async function jobCheck(userId: string, provider: string, model: string, requestId: string | null): Promise<Check> {
  if (!requestId) return { status: "sent" };
  const key = await vaultSecret(userId, provider === "fal" ? FAL_KEY_NAME : KEY_NAME);
  if (!key) return { status: "sent" };
  return (provider === "fal" ? falCheck(key, model, requestId) : hfCheck(key, requestId)).catch((): Check => ({ status: "sent" }));
}
export async function saveCheck(messageId: string, idx: number, r: Check): Promise<void> {
  await q("update hf_jobs set status = $3, url = $4, error = $5, draft_id = $6, done_at = now() where message_id = $1 and idx = $2 and status = 'sent'",
    [messageId, idx, r.status, r.url ?? null, r.error ?? null, r.draftId ?? null]);
}
