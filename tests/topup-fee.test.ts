// Top-up fee (owner 2026-09-30 20:56 · OpenRouter's shape): AI at cost, 10% + $0.50 on each top-up, smallest pack $10.
// Checkout shows the credit and the fee as two lines; the webhook adds the pack, not what was paid.
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const added: { member: string; micro: number }[] = [];
vi.mock("@/lib/credits", () => ({ topUp: async (member: string, micro: number) => { added.push({ member, micro }); return true; } }));

import { PACKS_USD, checkoutUrl, topupFeeCents } from "@/lib/stripe";
import { POST } from "@/app/api/stripe/webhook/route";

const MEMBER = "11111111-2222-3333-4444-555555555555";
const secret = "whsec_test";
const hook = (session: object) => {
  const body = JSON.stringify({ type: "checkout.session.completed", data: { object: session } });
  const t = Math.floor(Date.now() / 1000);
  const sig = `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
  return POST(new Request("http://x/api/stripe/webhook", { method: "POST", body, headers: { "stripe-signature": sig } }));
};

beforeEach(() => { process.env.STRIPE_WEBHOOK_SECRET = secret; process.env.STRIPE_SECRET_KEY = "sk_test"; });
afterEach(() => { vi.unstubAllGlobals(); added.length = 0; delete process.env.UNCHORE_TOPUP_FEE_RATE; delete process.env.UNCHORE_TOPUP_FEE_USD; });

describe("top-up fee", () => {
  it("is 10% + $0.50, smallest pack $10", () => {
    expect(PACKS_USD[0]).toBe(10);
    expect(PACKS_USD.map(topupFeeCents)).toEqual([150, 250, 550]);
  });
  it("can be changed on the server", () => {
    process.env.UNCHORE_TOPUP_FEE_RATE = "0.05"; process.env.UNCHORE_TOPUP_FEE_USD = "0";
    expect(topupFeeCents(20)).toBe(100);
  });
  it("goes to Stripe as its own line, with the credit in metadata", async () => {
    let sent = new URLSearchParams();
    vi.stubGlobal("fetch", async (_u: string, init: { body: URLSearchParams }) => { sent = init.body; return new Response(JSON.stringify({ url: "https://pay" })); });
    expect(await checkoutUrl({ member: MEMBER, email: "a@b.c", usd: 20, base: "https://u" })).toBe("https://pay");
    expect(sent.get("line_items[0][price_data][unit_amount]")).toBe("2000");
    expect(sent.get("line_items[1][price_data][unit_amount]")).toBe("250");
    expect(sent.get("line_items[1][price_data][product_data][name]")).toBe("Top-up fee");
    expect(sent.get("metadata[credit_cents]")).toBe("2000");
  });
});

describe("Stripe webhook", () => {
  const paid = { id: "cs_1", payment_status: "paid", currency: "usd", client_reference_id: MEMBER };
  it("adds the pack, not the fee", async () => {
    const r = await hook({ ...paid, amount_subtotal: 2250, metadata: { member: MEMBER, credit_cents: "2000" } });
    expect(r.status).toBe(200);
    expect(added).toEqual([{ member: MEMBER, micro: 20_000_000 }]);
  });
  it("a checkout made before the fee adds what was paid", async () => {
    await hook({ ...paid, amount_subtotal: 500, metadata: { member: MEMBER } });
    expect(added).toEqual([{ member: MEMBER, micro: 5_000_000 }]);
  });
  it("refuses a credit bigger than what was paid", async () => {
    const r = await hook({ ...paid, amount_subtotal: 1000, metadata: { member: MEMBER, credit_cents: "5000" } });
    expect(r.status).toBe(400);
    expect(added).toEqual([]);
  });
});
