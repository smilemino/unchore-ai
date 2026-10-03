// Upload sizes, safe for the browser too (lib/uploads.ts pulls in the database).
/** Files over 4 MB go up in pieces (app/api/files/upload) — up to this size (AI Soul big attachments, owner «yes» 10/2 21:40). */
export const MAX_BIG_UPLOAD = 500 * 1024 * 1024;
/** One piece — under Vercel's 4.5 MB request limit with room for headers. */
export const PART_BYTES = 3_500_000;
/** Up to this size a file is put together into one row; above it the pieces stay as they came (lib/big-files.ts) — no 500 MB in one value or in a function's memory. */
export const ONE_ROW_MAX = 50 * 1024 * 1024;
/** Files over ONE_ROW_MAX, all together, per member. Over it the upload doesn't start: they delete some in My files first (never deleted for them). */
export const BIG_FILES_QUOTA = 1024 * 1024 * 1024;
/** Exact length of piece i (only the last one is shorter) — the server refuses anything else, so a finished upload is whole. */
export const pieceLen = (size: number, i: number) => Math.min(PART_BYTES, size - i * PART_BYTES);
