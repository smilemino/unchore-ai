import { z } from "zod";
export const Design = z.object({
  title: z.string().trim().min(1).max(100), html: z.string().min(1).max(100_000),
  css: z.string().max(60_000), js: z.string().max(100_000),
  native: z.object({ fontSize: z.number().min(14).max(24).optional(), background: z.string().regex(/^#[0-9a-f]{6}$/i).optional(), foreground: z.string().regex(/^#[0-9a-f]{6}$/i).optional() }).strict().optional(),
}).strict();
export type Design = z.infer<typeof Design>;
export const Edit = z.discriminatedUnion("action", [
  z.object({ action: z.literal("read") }).strict(),
  z.object({ action: z.literal("save"), base: z.number().int().nonnegative(), design: Design }).strict(),
  z.object({ action: z.literal("restore"), base: z.number().int().nonnegative(), version: z.number().int().positive().nullable() }).strict(),
]);
export const KEY = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
export const TIP_GAP = 14 * 24 * 60 * 60 * 1000;
export function tipDue(count: number, last: string | null, used: boolean, hidden: boolean, now = Date.now()) {
  return !used && !hidden && count < 3 && (!last || now - Date.parse(last) >= TIP_GAP);
}
export type Rect = { x: number; y: number; width: number; height: number };
export function validRect(v: unknown, width: number, height: number): v is Rect {
  if (!v || typeof v !== "object") return false;
  const r = v as Rect;
  return [r.x, r.y, r.width, r.height].every(Number.isFinite) && r.x >= 0 && r.y >= 0 &&
    r.width >= Math.min(280, width) && r.height >= Math.min(260, height) &&
    r.x + r.width <= width + 1 && r.y + r.height <= height + 1;
}
export function appPath(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 300) return null;
  if (/^\/app\/(settings|automations|notes)$/.test(v)) return v;
  if (/^\/app(?:\?(?:c|p)=[0-9a-f-]{36})?$/.test(v)) return v;
  return null;
}
