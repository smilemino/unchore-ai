// At most MAX_ACTIVE automations on at once per member (AI Soul lib/server/reminders.ts MAX_ACTIVE 30). Turning one more on is
// refused with «limit»; nothing already on is turned off; one that is already on can still be edited.
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ on: 0, status: "paused", updates: 0 }));
vi.mock("@/lib/api", () => ({ requireUser: async () => ({ id: "u1", tz: "UTC" }), isResp: () => false }));
vi.mock("@/lib/db", () => ({
  one: async (sql: string) => {
    if (sql.includes("count(*)")) return { n: db.on };
    if (sql.startsWith("select schedule, recipe, status")) return { schedule: "daily@09:00", recipe: "prompt", status: db.status };
    return null;
  },
  q: async (sql: string) => { if (sql.startsWith("update automations")) db.updates++; return []; },
  asMember: async () => null,
}));

import { MAX_ACTIVE, activeCount } from "@/lib/automation";
import { PATCH } from "@/app/api/automations/[id]/route";

const turnOn = () => PATCH(new Request("https://unchore.ai/api/automations/a1", { method: "PATCH", body: JSON.stringify({ status: "active" }) }), { params: Promise.resolve({ id: "a1" }) });

beforeEach(() => { db.on = 0; db.status = "paused"; db.updates = 0; });

describe("automation cap", () => {
  it("is 30, the same as AI Soul", async () => {
    expect(MAX_ACTIVE).toBe(30);
    db.on = 7;
    expect(await activeCount("u1")).toBe(7);
  });
  it("turns one on below the cap", async () => {
    db.on = MAX_ACTIVE - 1;
    const r = await turnOn();
    expect(r.status).toBe(200);
    expect(db.updates).toBeGreaterThan(0);
  });
  it("refuses one more at the cap and changes nothing", async () => {
    db.on = MAX_ACTIVE;
    const r = await turnOn();
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: "limit", max: MAX_ACTIVE });
    expect(db.updates).toBe(0);
  });
  it("one already on is not blocked (it doesn't add to the count)", async () => {
    db.on = MAX_ACTIVE; db.status = "active";
    expect((await turnOn()).status).toBe(200);
  });
});
