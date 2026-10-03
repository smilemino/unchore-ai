// Unchore credit + Defend (2026-09-30 owner «yes»): masking and refusal rules (server and the exported skill stay equal),
// Stripe signature check, and with a throwaway Postgres (TEST_DATABASE_URL) the wallet, the day cap for welcome credit,
// top-up once per checkout, tool keys, members locked out of the money tables, and POST /api/defend end to end.
import { execFileSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { isRefusal, mask } from "@/lib/defend";
import { verifyStripe } from "@/lib/stripe";
import { priceMicro } from "@/lib/credits";

const PEM = ["-----BEGIN", "RSA PRIVATE KEY-----\nMIIEow\n-----END", "RSA PRIVATE KEY-----"].join(" ");
const SAMPLE = [
  "login from 203.0.113.9 at 2026-09-30T01:02:03Z user kim@example.com phone 010-1234-5678",
  "card 4111 1111 1111 1111 id 900101-1234567 ssn 123-45-6789",
  "Authorization: Bearer sk-abcDEF123456789xyz token unc_abcdefghijklmnopqrstuvwx", PEM,
].join("\n");

describe("Defend masking and refusals", () => {
  it("masks personal data and secrets but keeps the evidence (IPs, times)", () => {
    const { text, hits } = mask(SAMPLE);
    expect(hits).toBe(8);
    for (const gone of ["kim@example.com", "010-1234-5678", "4111 1111", "900101-1234567", "123-45-6789", "sk-abcDEF", "unc_abcdef", "MIIEow"]) expect(text).not.toContain(gone);
    expect(text).toContain("203.0.113.9");
    expect(text).toContain("2026-09-30T01:02:03Z");
    expect(text).toContain("PRIVATE KEY-----");
  });
  it("a short answer opening with a refusal is a refusal; a long analysis is not", () => {
    expect(isRefusal("")).toBe(true);
    expect(isRefusal("I'm sorry, but I can't help with that.")).toBe(true);
    expect(isRefusal("죄송하지만 도와드릴 수 없습니다.")).toBe(true);
    expect(isRefusal(`The attacker reused a leaked token. ${"Details. ".repeat(80)} I can't be sure of the exact minute.`)).toBe(false);
  });
  it("the exported skill masks and refuses exactly like the server", async () => {
    const skill = await import("../skills/unchore-defend/scripts/defend.mjs");
    expect(skill.mask(SAMPLE)).toEqual(mask(SAMPLE));
    for (const s of ["", "I cannot help with this request.", "Here is what happened: …"]) expect(skill.isRefusal(s)).toBe(isRefusal(s));
    const { CHAIN } = await import("@/lib/defend");
    expect(skill.CHAIN).toEqual(CHAIN);
  });
});

describe("Stripe signature and price", () => {
  const secret = "whsec_test";
  const sign = (body: string, t: number) => `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
  it("accepts Stripe's signature within 5 minutes only", () => {
    const now = Date.now(), t = Math.floor(now / 1000), body = '{"a":1}';
    expect(verifyStripe(body, sign(body, t), secret, now)).toBe(true);
    expect(verifyStripe(body + " ", sign(body, t), secret, now)).toBe(false);
    expect(verifyStripe(body, sign(body, t - 600), secret, now)).toBe(false);
    expect(verifyStripe(body, null, secret, now)).toBe(false);
  });
  it("price = what the AI cost, no markup, rounded up to a micro-dollar (the top-up fee pays — tests/topup-fee.test.ts)", () => {
    expect(priceMicro(0.01)).toBe(10_000);
    expect(priceMicro(0.0123456)).toBe(12_346);
    expect(priceMicro(0)).toBe(0);
  });
});

const URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL)("Unchore credit with Postgres", () => {
  let db: typeof import("@/lib/db");
  let cr: typeof import("@/lib/credits");
  let tok: typeof import("@/lib/api-tokens");
  const user = async () => (await db.one<{ id: string }>("insert into users(email) values ($1) returning id", [`c-${randomUUID()}@t.test`]))!.id;

  beforeAll(async () => {
    process.env.DATABASE_URL = URL;
    process.env.UNCHORE_WELCOME_MAX_MEMBERS = "1000000";   // other files share this database; the first-N rule has its own test
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: URL }, stdio: "pipe" });
    db = await import("@/lib/db");
    cr = await import("@/lib/credits");
    tok = await import("@/lib/api-tokens");
  });
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.UNCHORE_HOUSE_OPENROUTER_KEY; delete process.env.UNCHORE_WELCOME_DAY_CAP_USD; });

  it("opens a wallet with the welcome credit once", async () => {
    const m = await user();
    expect(await cr.wallet(m)).toEqual({ micro: 2_000_000, paid: false });
    expect(await cr.wallet(m)).toEqual({ micro: 2_000_000, paid: false });
    expect((await cr.history(m)).map((h) => h.kind)).toEqual(["welcome"]);
  });

  it("gives the welcome credit only to the first N members", async () => {
    const given = Number((await db.asOwner(() => db.one<{ n: string }>("select count(*) as n from credit_ledger where kind = 'welcome'")))!.n);
    process.env.UNCHORE_WELCOME_MAX_MEMBERS = String(given + 1);
    try {
      const a = await user(), b = await user();
      expect(await cr.wallet(a)).toEqual({ micro: 2_000_000, paid: false });
      expect(await cr.welcomeLeft()).toBe(0);
      expect(await cr.wallet(b)).toEqual({ micro: 0, paid: false });
      expect(await cr.history(b)).toEqual([]);
      expect(await cr.canSpend(b)).toEqual({ ok: false, why: "empty" });
    } finally { process.env.UNCHORE_WELCOME_MAX_MEMBERS = "1000000"; }
  });

  it("members can't read or write the money tables, even their own rows", async () => {
    const m = await user();
    await cr.wallet(m);
    await db.asMember(m, async () => {
      await expect(db.q("select * from credit_wallets")).rejects.toThrow(/permission denied/);
      await expect(db.q("update credit_wallets set micro = 999999999 where member = $1", [m])).rejects.toThrow(/permission denied/);
      await expect(db.q("insert into credit_ledger(member, delta_micro, kind) values ($1, 1, 'topup')", [m])).rejects.toThrow(/permission denied/);
      await expect(db.q("select * from api_tokens")).rejects.toThrow(/permission denied/);
      expect((await cr.wallet(m)).micro).toBe(2_000_000);   // the app's own path still works inside a member's request
    });
  });

  it("charges the price, and a top-up counts once per checkout and lifts the welcome day cap", async () => {
    const m = await user();
    await cr.wallet(m);
    const c = await cr.charge(m, 0.1, "Defend · claude");
    expect(c).toEqual({ charged: 100_000, micro: 1_900_000 });   // at cost, no markup
    expect(await cr.topUp(m, 5_000_000, "stripe:cs_1", "Top-up $5.00")).toBe(true);
    expect(await cr.topUp(m, 5_000_000, "stripe:cs_1", "Top-up $5.00")).toBe(false);
    expect(await cr.wallet(m)).toEqual({ micro: 6_900_000, paid: true });
    process.env.UNCHORE_WELCOME_DAY_CAP_USD = "0";
    expect(await cr.canSpend(m)).toEqual({ ok: true });
    const fresh = await user();
    expect(await cr.canSpend(fresh)).toEqual({ ok: false, why: "day_cap" });
  });

  it("the welcome credit doesn't answer chat; bought credit does (owner 2026-10-01)", async () => {
    process.env.UNCHORE_HOUSE_OPENROUTER_KEY = "house-test";
    process.env.UNCHORE_WELCOME_DAY_CAP_USD = "1000000";   // other files spend in this database too
    const m = await user();
    expect(await cr.creditReady(m)).toBe(false);
    expect(await cr.topUp(m, 5_000_000, `stripe:cs_${randomUUID()}`, "Top-up $5.00")).toBe(true);
    expect(await cr.creditReady(m)).toBe(true);
  });

  it("the welcome credit pays for the Google voice; an empty balance turns it off (owner 2026-10-01)", async () => {
    const v = await import("@/lib/voice/google");
    process.env.GEMINI_API_KEY = "test";
    try {
      const m = await user();
      expect((await v.allowance(m, "UTC")).credit).toBe(true);           // the first look opens the $2 welcome credit
      const others = await cr.welcomeUsedTodayMicro();                     // what other tests spent, measured before this voice charge
      await v.chargeVoice(m, 100);                                         // 100 s × $0.00015 = $0.015
      expect((await cr.wallet(m)).micro).toBe(2_000_000 - 15_000);
      expect((await cr.history(m))[0]).toMatchObject({ kind: "use", note: "Google voice", delta_micro: -15_000 });
      // Voice doesn't count toward the welcome credit's AI day cap. Other tests spend welcome credit in this database too,
      // so the cap sits just above what they used (measured above) — below that plus this voice charge (a fixed $0.01 failed whenever they ran first).
      process.env.UNCHORE_WELCOME_DAY_CAP_USD = String((others + 5_000) / 1_000_000);
      expect(await cr.canSpend(m)).toEqual({ ok: true });
      await db.asOwner(() => db.q("update credit_wallets set micro = 0 where member = $1", [m]));   // used up
      expect((await v.allowance(m, "UTC")).credit).toBe(false);
      process.env.UC_VOICE_CREDIT = "off";                                 // the switch back to «free within the daily minutes»
      expect((await v.allowance(m, "UTC")).credit).toBe(true);
    } finally { delete process.env.GEMINI_API_KEY; delete process.env.UC_VOICE_CREDIT; }
  });

  it("tool keys: shown once, found by hash, revoked for good, five at most", async () => {
    const m = await user();
    const made = (await tok.createToken(m, "laptop"))!;
    expect(made.token).toMatch(/^unc_/);
    expect(await tok.memberFromToken(`Bearer ${made.token}`)).toBe(m);
    expect(await tok.memberFromToken(`Bearer ${made.token}x`)).toBeNull();
    expect(JSON.stringify(await db.q("select * from api_tokens where member = $1", [m]))).not.toContain(made.token);
    expect(await tok.revokeToken(m, made.row.id)).toBe(true);
    expect(await tok.memberFromToken(`Bearer ${made.token}`)).toBeNull();
    for (let i = 0; i < 5; i++) expect(await tok.createToken(m, null)).not.toBeNull();
    expect(await tok.createToken(m, null)).toBeNull();
  });

  it("POST /api/defend with a tool key: masks, skips the refusing AI, charges the credit", async () => {
    const m = await user();
    const { token } = (await tok.createToken(m, null))!;
    process.env.UNCHORE_HOUSE_OPENROUTER_KEY = "house-test";
    const sent: { model: string; text: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: { body: string }) => {
      const b = JSON.parse(init.body);
      sent.push({ model: b.model, text: b.messages[1].content });
      const content = b.model.startsWith("anthropic/") ? "I'm sorry, I can't help with that." : "The attacker used a stolen session from 203.0.113.9; rotate keys first.";
      return new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { cost: 0.05 } }), { status: 200 });
    }));
    const { POST } = await import("@/app/api/defend/route");
    const res = await POST(new Request("http://t/api/defend", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ question: "What happened?", material: SAMPLE }) }));
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j).toMatchObject({ answered_by: "gpt", paid_with: "credit", masked: 8, charged_usd: 0.1, balance_usd: 1.9 });
    expect(j.tried.map((t: { status: string }) => t.status)).toEqual(["refused", "ok"]);
    expect(sent.map((s) => s.model)).toEqual(["anthropic/claude-opus-5.5", "openai/gpt-6-astra"]);
    for (const s of sent) expect(s.text).not.toContain("kim@example.com");
  });

  it("POST /api/defend with no credit on and no own key: 402 with where to top up", async () => {
    const m = await user();
    const { token } = (await tok.createToken(m, null))!;
    const { POST } = await import("@/app/api/defend/route");
    const res = await POST(new Request("http://t/api/defend", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ question: "Is this an attack?" }) }));
    expect(res.status).toBe(402);
    expect((await res.json()).error).toBe("no_credit");
  });
});
