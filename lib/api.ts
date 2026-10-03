import { NextResponse } from "next/server";
import { actAs } from "./db";
import { currentUser, type User } from "./session";

const signedIn = new WeakSet<object>();

export async function requireUser(): Promise<User | NextResponse> {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "login_required" }, { status: 401 });
  signedIn.add(u);
  return u;
}

/** Every route does `const u = await requireUser(); if (isResp(u)) return u;`.
 *  When `u` is the member from requireUser(), this also fences the rest of the route to that member's rows
 *  (lib/db.ts actAs). It must run here, in the route's own frame: a fence set inside requireUser() does not
 *  reliably carry back across the `await` (tests/member-lock.test.ts). */
export function isResp(x: unknown): x is NextResponse {
  if (x instanceof NextResponse) return true;
  if (x && typeof x === "object" && signedIn.has(x)) actAs((x as User).id);
  return false;
}
export function cronOk(req: Request): boolean {
  const s = process.env.CRON_SECRET;
  return Boolean(s) && req.headers.get("authorization") === `Bearer ${s}`;
}
