import { NextResponse } from "next/server";
import { isResp, requireUser } from "@/lib/api";
import { appUrl } from "@/lib/app-url";
import { PACKS_USD, checkoutUrl, stripeOn } from "@/lib/stripe";

/** Start a Stripe Checkout for one credit pack. The credit is added only by the signed webhook (app/api/stripe/webhook). */
export async function POST(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  if (!stripeOn()) return NextResponse.json({ error: "topup_closed" }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { usd?: unknown };
  const pack = PACKS_USD.find((p) => p === b.usd);
  if (!pack) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  try {
    return NextResponse.json({ url: await checkoutUrl({ member: u.id, email: u.email, usd: pack, base: appUrl(req) }) });
  } catch (e) {
    return NextResponse.json({ error: "stripe", detail: String((e as Error).message).slice(0, 200) }, { status: 502 });
  }
}
