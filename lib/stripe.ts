import { createHmac, timingSafeEqual } from "node:crypto";

// Stripe, called over plain HTTPS (no SDK). Off until STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are set on the server —
// until then the app says «top-up opens soon» and Unchore credit is the welcome credit only.

// Top-up (owner 2026-09-30 20:56 · OpenRouter's shape): AI runs at the provider's price with no markup, and each top-up
// adds a fee instead — 10% + $0.50 covers OpenRouter's own 5.5% top-up fee and the card fee (overseas card ≈ 4.4% + $0.30).
// The smallest pack is $10: below it the fixed part of the card fee eats the fee. Above $50 an overseas card is break-even.
export const PACKS_USD = [10, 20, 50] as const;
const num = (v: string | undefined, d: number) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : d; };
export const topupFeeRate = () => num(process.env.UNCHORE_TOPUP_FEE_RATE, 0.1);
export const topupFeeFixedUsd = () => num(process.env.UNCHORE_TOPUP_FEE_USD, 0.5);
/** The fee for adding `usd` of credit, in cents. */
export const topupFeeCents = (usd: number) => Math.round(usd * 100 * topupFeeRate() + topupFeeFixedUsd() * 100);
export const stripeOn = () => Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);

/** A Stripe Checkout page for one credit pack: the credit and the top-up fee as two lines, so the card statement matches. */
export async function checkoutUrl(o: { member: string; email: string; usd: number; base: string }): Promise<string> {
  const f = new URLSearchParams({
    mode: "payment",
    success_url: `${o.base}/app/settings?tab=ai&topup=ok`,
    cancel_url: `${o.base}/app/settings?tab=ai`,
    client_reference_id: o.member,
    customer_email: o.email,
    "metadata[member]": o.member,
    "metadata[credit_cents]": String(Math.round(o.usd * 100)),
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(Math.round(o.usd * 100)),
    "line_items[0][price_data][product_data][name]": `Unchore credit $${o.usd}`,
    "line_items[1][quantity]": "1",
    "line_items[1][price_data][currency]": "usd",
    "line_items[1][price_data][unit_amount]": String(topupFeeCents(o.usd)),
    "line_items[1][price_data][product_data][name]": "Top-up fee",
  });
  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST", body: f,
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, "content-type": "application/x-www-form-urlencoded" },
  });
  const j = (await r.json().catch(() => ({}))) as { url?: string; error?: { message?: string } };
  if (!r.ok || !j.url) throw new Error(j.error?.message ?? `stripe ${r.status}`);
  return j.url;
}

/** Stripe's «Stripe-Signature: t=…,v1=…» check (HMAC-SHA256 of «t.body»), within 5 minutes. */
export function verifyStripe(body: string, header: string | null, secret: string, now = Date.now()): boolean {
  const parts = (header ?? "").split(",").map((p) => p.split("=") as [string, string]);
  const t = Number(parts.find(([k]) => k === "t")?.[1]);
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!Number.isFinite(t) || !sigs.length || Math.abs(now / 1000 - t) > 300) return false;
  const want = Buffer.from(createHmac("sha256", secret).update(`${t}.${body}`).digest("hex"));
  return sigs.some((s) => { const got = Buffer.from(s ?? ""); return got.length === want.length && timingSafeEqual(got, want); });
}
