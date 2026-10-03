import { NextResponse } from "next/server";
import { isResp, requireUser } from "@/lib/api";
import { seal } from "@/lib/crypto";
import { q } from "@/lib/db";
import { planLabel, subCall, SubError } from "@/lib/claude-sub";

export const maxDuration = 60;

type Status = { ok?: boolean; why?: string; url?: string; code?: string; loggedIn?: boolean; waiting?: boolean; email?: string | null };

// Connect the member's own ChatGPT Plus/Pro plan (owner 2026-10-01). POST starts OpenAI's device sign-in on the worker and
// returns OpenAI's page plus the one-time code to type there; the chat then asks GET every few seconds until it's done.
// Nothing but «connected» is stored here — the sign-in itself stays in that member's folder on the worker (worker/chatgpt.mjs).
// The row shows which OpenAI account it is (e-mail, masked like keys) so a member with two accounts can tell.
async function remember(userId: string, email?: string | null) {
  const label = planLabel("ChatGPT", email);
  await q(
    "insert into user_keys(user_id, provider, enc, hint) values ($1, 'chatgpt_sub', $2, $3) on conflict (user_id, provider) do update set enc = excluded.enc, hint = excluded.hint, updated_at = now()",
    [userId, seal(userId), label],
  );
  return label;
}

export async function POST() {
  const u = await requireUser();
  if (isResp(u)) return u;
  try {
    const r = await subCall<Status>("login/start", { user: u.id }, 45_000, "chatgpt");
    return r.ok && r.url && r.code ? NextResponse.json({ ok: true, url: r.url, code: r.code }) : NextResponse.json({ error: r.why ?? "start_failed" }, { status: 502 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof SubError ? e.why : "error" }, { status: 502 });
  }
}

/** Done yet? Also re-checks an existing connection and keeps the «connected» row honest. */
export async function GET() {
  const u = await requireUser();
  if (isResp(u)) return u;
  try {
    const r = await subCall<Status>("status", { user: u.id }, 40_000, "chatgpt");
    if (r.loggedIn) return NextResponse.json({ connected: true, hint: await remember(u.id, r.email) });
    if (r.waiting) return NextResponse.json({ connected: false, waiting: true });
    await q("delete from user_keys where user_id = $1 and provider = 'chatgpt_sub'", [u.id]);
    return NextResponse.json({ connected: false });
  } catch (e) {
    return NextResponse.json({ error: e instanceof SubError ? e.why : "error" }, { status: 502 });
  }
}

export async function DELETE() {
  const u = await requireUser();
  if (isResp(u)) return u;
  await subCall("logout", { user: u.id }, 40_000, "chatgpt").catch(() => null);
  await q("delete from user_keys where user_id = $1 and provider = 'chatgpt_sub'", [u.id]);
  return NextResponse.json({ ok: true });
}
