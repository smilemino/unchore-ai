import { NextResponse } from "next/server";
import { isResp, requireUser } from "@/lib/api";
import { createToken, listTokens, revokeToken } from "@/lib/api-tokens";
import { history, wallet, welcomeLeft, welcomeMaxMembers, welcomeUsd } from "@/lib/credits";
import { PACKS_USD, stripeOn, topupFeeCents, topupFeeFixedUsd, topupFeeRate } from "@/lib/stripe";

/** Settings → AI → Unchore credit: balance, recent lines, tool keys, and whether top-up is open. */
export async function GET() {
  const u = await requireUser();
  if (isResp(u)) return u;
  const w = await wallet(u.id);
  return NextResponse.json({
    micro: w.micro, paid: w.paid, history: await history(u.id), tokens: await listTokens(u.id),
    on: Boolean(process.env.UNCHORE_HOUSE_OPENROUTER_KEY), topup: stripeOn(), packs: PACKS_USD,
    pays: PACKS_USD.map((p) => (p * 100 + topupFeeCents(p)) / 100), fee_pct: Math.round(topupFeeRate() * 100), fee_usd: topupFeeFixedUsd(),
    welcome_usd: welcomeUsd(), welcome_max: welcomeMaxMembers(), welcome_left: await welcomeLeft(),
  });
}

/** A new tool key — the plain token is returned once. */
export async function POST(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const b = (await req.json().catch(() => ({}))) as { label?: unknown };
  const made = await createToken(u.id, typeof b.label === "string" ? b.label : null);
  if (!made) return NextResponse.json({ error: "too_many" }, { status: 409 });
  return NextResponse.json({ token: made.token, row: made.row });
}

export async function DELETE(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const id = new URL(req.url).searchParams.get("token") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  return NextResponse.json({ ok: await revokeToken(u.id, id) });
}
