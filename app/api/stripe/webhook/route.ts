import { NextResponse } from "next/server";
import { topUp } from "@/lib/credits";
import { verifyStripe } from "@/lib/stripe";

type Session = { id?: string; payment_status?: string; amount_subtotal?: number; currency?: string; metadata?: { member?: string; credit_cents?: string }; client_reference_id?: string };

/** Stripe → «checkout finished and paid» → add that pack to the member's credit, once per checkout id.
 *  The credit is the pack (metadata credit_cents, set by our server) — not what was paid, which includes the top-up fee. */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const body = await req.text();
  if (!secret || !verifyStripe(body, req.headers.get("stripe-signature"), secret)) return NextResponse.json({ error: "bad_signature" }, { status: 400 });
  const ev = JSON.parse(body) as { type?: string; data?: { object?: Session } };
  const s = ev.data?.object;
  if ((ev.type === "checkout.session.completed" || ev.type === "checkout.session.async_payment_succeeded") && s?.payment_status === "paid") {
    const member = s.metadata?.member ?? s.client_reference_id ?? "";
    const paid = Number(s.amount_subtotal ?? 0);
    const cents = s.metadata?.credit_cents ? Number(s.metadata.credit_cents) : paid;   // sessions made before the fee: credit = what was paid
    if (!/^[0-9a-f-]{36}$/i.test(member) || s.currency !== "usd" || !(Number.isInteger(cents) && cents > 0 && cents <= paid) || !s.id) return NextResponse.json({ error: "bad_session" }, { status: 400 });
    const added = await topUp(member, cents * 10_000, `stripe:${s.id}`, `Top-up $${(cents / 100).toFixed(2)}`);
    return NextResponse.json({ ok: true, added });
  }
  return NextResponse.json({ ok: true, ignored: ev.type ?? "" });
}
