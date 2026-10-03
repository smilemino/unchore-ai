import { NextResponse } from "next/server";
import { z } from "zod";
import { isResp, requireUser } from "@/lib/api";
import { seal } from "@/lib/crypto";
import { q } from "@/lib/db";
import { planLabel, subCall, SubError } from "@/lib/claude-sub";

export const maxDuration = 90;

type Status = { ok?: boolean; why?: string; url?: string; loggedIn?: boolean; plan?: string | null; email?: string | null };

// Connect the user's own Claude Pro/Max plan. Step 1 returns Anthropic's sign-in link; step 2 passes the one-time code
// the user copied from Anthropic's page straight to Claude Code on the worker. Nothing but «connected» is stored here.
const Body = z.discriminatedUnion("step", [
  z.object({ step: z.literal("start") }),
  z.object({ step: z.literal("finish"), code: z.string().min(10).max(500) }),
]);

async function remember(userId: string, s: Status) {
  const label = planLabel(s.plan ? `Claude ${s.plan[0]!.toUpperCase()}${s.plan.slice(1)}` : "Claude", s.email);
  await q(
    "insert into user_keys(user_id, provider, enc, hint) values ($1, 'claude_sub', $2, $3) on conflict (user_id, provider) do update set enc = excluded.enc, hint = excluded.hint, updated_at = now()",
    [userId, seal(userId), label],
  );
  return label;
}

export async function POST(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  try {
    if (b.data.step === "start") {
      const r = await subCall<Status>("login/start", { user: u.id }, 30_000);
      return r.ok && r.url ? NextResponse.json({ ok: true, url: r.url }) : NextResponse.json({ error: r.why ?? "start_failed" }, { status: 502 });
    }
    const r = await subCall<Status>("login/finish", { user: u.id, code: b.data.code });
    if (!r.ok || !r.loggedIn) return NextResponse.json({ error: r.why ?? "not_signed_in" }, { status: 400 });
    return NextResponse.json({ ok: true, hint: await remember(u.id, r) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof SubError ? e.why : "error" }, { status: 502 });
  }
}

/** Re-checks the plan (e.g. after the user signed out on claude.ai) and keeps the «connected» row honest. */
export async function GET() {
  const u = await requireUser();
  if (isResp(u)) return u;
  try {
    const r = await subCall<Status>("status", { user: u.id }, 40_000);
    if (r.loggedIn) return NextResponse.json({ connected: true, hint: await remember(u.id, r) });
    await q("delete from user_keys where user_id = $1 and provider = 'claude_sub'", [u.id]);
    return NextResponse.json({ connected: false });
  } catch (e) {
    return NextResponse.json({ error: e instanceof SubError ? e.why : "error" }, { status: 502 });
  }
}

export async function DELETE() {
  const u = await requireUser();
  if (isResp(u)) return u;
  await subCall("logout", { user: u.id }, 40_000).catch(() => null);
  await q("delete from user_keys where user_id = $1 and provider = 'claude_sub'", [u.id]);
  return NextResponse.json({ ok: true });
}
