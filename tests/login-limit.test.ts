// Sign-in e-mail limits (AI Soul lib/server/login-limit.ts): once a minute from the same place to the same address, at most
// LIMITS.perPlaceHour addresses an hour from one place, a ceiling for the whole site; refused asks send no mail and save no link.
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ counts: {} as Record<string, number>, inserts: [] as unknown[][], sql: "" }));
const mail = vi.hoisted(() => ({ sent: 0 }));
vi.mock("@/lib/db", () => ({
  q: async (_sql: string, params: unknown[]) => { db.inserts.push(params); return []; },
  one: async (sql: string) => { if (sql.includes("requested_from")) { db.sql = sql; return db.counts; } return { n: 0 }; },
}));
vi.mock("@/lib/mail", () => ({ esc: (s: string) => s, sendMail: async () => { mail.sent++; return true; } }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

import { LIMITS, clientIp, countAsks, placeKey, refuse } from "@/lib/login-limit";

const zero = { same: 0, place: 0, perMin: 0, perHour: 0 };
beforeEach(() => { db.counts = {}; db.inserts = []; db.sql = ""; mail.sent = 0; delete process.env.UNCHORE_GOOGLE_CLIENT_ID; process.env.APP_URL = "https://unchore.ai"; });

describe("sign-in e-mail limits", () => {
  it("refuses the same place within a minute, too many addresses from one place, and a busy site", () => {
    expect(LIMITS.sameSec).toBe(60);
    expect(refuse(zero)).toBeNull();
    expect(refuse({ ...zero, same: 1 })).toBe("wait");
    expect(refuse({ ...zero, place: LIMITS.perPlaceHour - 1 })).toBeNull();
    expect(refuse({ ...zero, place: LIMITS.perPlaceHour })).toBe("too_many");
    expect(refuse({ ...zero, perMin: LIMITS.allPerMin })).toBe("busy");
    expect(refuse({ ...zero, perHour: LIMITS.allPerHour })).toBe("busy");
  });
  it("keeps the internet address only as a hash", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(clientIp(new Headers())).toBe("?");
    expect(placeKey("203.0.113.7")).not.toContain("203.0.113.7");
    expect(placeKey("203.0.113.7")).toBe(placeKey("203.0.113.7"));
    expect(placeKey("203.0.113.8")).not.toBe(placeKey("203.0.113.7"));
  });
  it("counts only links asked for through the e-mail form (other sign-in links have no «requested_from»)", async () => {
    db.counts = { same: 0, place: 2, perMin: 1, perHour: 3 };
    expect(await countAsks("ip:x", "a@t.test")).toEqual({ same: 0, place: 2, perMin: 1, perHour: 3 });
    expect(db.sql).toContain("requested_from is not null");
  });

  const ask = async () => {
    const { POST } = await import("@/app/api/auth/email/route");
    return POST(new Request("https://unchore.ai/api/auth/email", { method: "POST", headers: { "x-forwarded-for": "203.0.113.7" }, body: JSON.stringify({ email: "a@t.test" }) }));
  };
  it("sends, and saves where the ask came from only as a hash", async () => {
    expect((await ask()).status).toBe(200);
    expect(mail.sent).toBe(1);
    expect(db.inserts[0]).toContain(placeKey("203.0.113.7"));
    expect(JSON.stringify(db.inserts)).not.toContain("203.0.113.7");
  });
  it("a refused ask sends no mail and saves no link", async () => {
    db.counts = { same: 1 };
    const r = await ask();
    expect(r.status).toBe(429);
    expect(await r.json()).toEqual({ error: "wait", retry_after: 60 });
    db.counts = { perHour: LIMITS.allPerHour };
    expect(await (await ask()).json()).toEqual({ error: "busy" });
    expect(mail.sent).toBe(0);
    expect(db.inserts).toHaveLength(0);
  });
});
