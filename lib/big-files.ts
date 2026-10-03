// Files over 50 MB (up to 500 MB): the 3.5 MB pieces stay in upload_parts, locked one by one, and the «files» row points at them
// (files.parts_of — db/migrations/041). Everything here reads one piece at a time, so a Vercel function never holds the whole file.
import { one, q } from "./db";
import { unlockBytes } from "./privacy";
import { BIG_FILES_QUOTA, ONE_ROW_MAX, PART_BYTES } from "./upload-limits";

export const isBig = (size: number) => size > ONE_ROW_MAX;

/** Bytes this member keeps in files over 50 MB. */
export async function bigUsed(userId: string): Promise<number> {
  const r = await one<{ n: string }>("select coalesce(sum(size), 0)::bigint as n from files where user_id = $1 and parts_of is not null", [userId]);
  return Number(r?.n ?? 0);
}

/** Room for one more big file of this size? (asked at the start and again at the last step) */
export async function bigRoom(userId: string, size: number): Promise<{ ok: boolean; used: number; max: number }> {
  const used = await bigUsed(userId);
  return { ok: !isBig(size) || used + size <= BIG_FILES_QUOTA, used, max: BIG_FILES_QUOTA };
}

/** One piece of a finished big file, unlocked (null when it isn't there — pieces of an upload still on its way aren't served). */
export async function bigPiece(uploadId: string, i: number): Promise<Buffer | null> {
  const r = await one<{ data: Buffer }>("select p.data from upload_parts p join files f on f.parts_of = p.upload_id and f.user_id = p.user_id where p.upload_id = $1 and p.idx = $2", [uploadId, i]);
  return r ? unlockBytes(r.data) : null;
}

/** Bytes from..to (inclusive) of a big file as a stream, one piece read at a time. */
export function bigStream(uploadId: string, from: number, to: number): ReadableStream<Uint8Array> {
  let at = from;
  return new ReadableStream<Uint8Array>({
    async pull(c) {
      if (at > to) { c.close(); return; }
      const i = Math.floor(at / PART_BYTES), p = await bigPiece(uploadId, i);
      if (!p) { c.error(new Error("piece missing")); return; }
      const start = at - i * PART_BYTES, end = Math.min(p.length, to - i * PART_BYTES + 1);
      c.enqueue(new Uint8Array(p.subarray(start, end)));
      at = i * PART_BYTES + end;
    },
  });
}

/** Which pieces of an upload already arrived — the browser skips them when an upload goes on after a break. */
export async function piecesHave(uploadId: string, userId: string): Promise<number[]> {
  return (await q<{ idx: number }>("select idx from upload_parts where upload_id = $1 and user_id = $2 order by idx", [uploadId, userId])).map((r) => r.idx);
}

/** Nightly: pieces left half-way more than a day go; a kept big file keeps its pieces, a deleted one's (or its chat's) go too. */
export async function sweepPieces(): Promise<void> {
  await q("delete from upload_parts p where p.created_at < now() - interval '1 day' and not exists (select 1 from files f where f.parts_of = p.upload_id)");
}
