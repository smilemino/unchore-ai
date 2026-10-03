import { trFor } from "@/lib/i18n-server";
import { describe, expect, it } from "vitest";
import { askedTimed, checkSpec, extractReminders, replacesSame, toSchedule } from "../lib/reminders";
import { describeSchedule, nextRun, validSchedule } from "../lib/schedule";
const ko = { lang: "ko" as const, t: trFor("ko") }, en = { lang: "en" as const, t: trFor("en") };

// AI Soul 1d05cf6 (2026-10-01): a once-a-year filing was set up as a daily check — monthly and yearly repeats instead.
describe("monthly and yearly reminders", () => {
  it("blocks are read and become calendar schedules that keep going for years", () => {
    const { proposals } = extractReminders("<<<remind monthly=15T10:00>>>\ntitle: Rent\nRemind me to pay the rent\n<<<end>>>\n<<<remind yearly=2-15T09:30>>>\nGet the tax filing ready\n<<<end>>>");
    expect(proposals.map((p) => [p.kind, p.spec])).toEqual([["monthly", "15T10:00"], ["yearly", "2-15T09:30"]]);
    const now = new Date("2026-10-01T00:00:00Z");
    const m = toSchedule(proposals[0]!, "Asia/Seoul", now), y = toSchedule(proposals[1]!, "Asia/Seoul", now);
    expect([m.schedule, y.schedule]).toEqual(["monthly@15@10:00", "yearly@02-15@09:30"]);
    expect(validSchedule(m.schedule) && validSchedule(y.schedule)).toBe(true);
    expect(m.endsAt.getTime() - now.getTime()).toBe(3 * 365 * 86_400_000);
    expect(y.endsAt.getTime() - now.getTime()).toBe(10 * 365 * 86_400_000);
    expect(replacesSame(proposals[0]!) && replacesSame(proposals[1]!)).toBe(true);
    for (const p of proposals) expect(checkSpec(p)).toBeNull();
  });
  it("bad forms are refused", () => {
    for (const [kind, spec] of [["monthly", "32T10:00"], ["monthly", "2-15T10:00"], ["yearly", "15T10:00"], ["yearly", "13-01T10:00"], ["yearly", "02-30T25:00"]] as const)
      expect(checkSpec({ kind, spec, forSpec: null, prompt: "x" })).toMatch(/bad (monthly|yearly)/);
    expect(validSchedule("monthly@00@10:00") || validSchedule("yearly@02-15@24:00")).toBe(false);
  });
  it("next run in the member's zone; a day the month lacks runs on its last day", () => {
    expect(nextRun("monthly@15@10:00", "Asia/Seoul", new Date("2026-10-01T00:00:00Z")).toISOString()).toBe("2026-10-15T01:00:00.000Z");
    expect(nextRun("monthly@15@10:00", "Asia/Seoul", new Date("2026-10-15T02:00:00Z")).toISOString()).toBe("2026-11-15T01:00:00.000Z");
    expect(nextRun("monthly@31@08:00", "UTC", new Date("2026-11-01T00:00:00Z")).toISOString()).toBe("2026-11-30T08:00:00.000Z");
    expect(nextRun("monthly@31@08:00", "UTC", new Date("2026-12-20T00:00:00Z")).toISOString()).toBe("2026-12-31T08:00:00.000Z");
    expect(nextRun("yearly@02-15@10:00", "Asia/Seoul", new Date("2026-10-01T00:00:00Z")).toISOString()).toBe("2027-02-15T01:00:00.000Z");
    expect(nextRun("yearly@02-29@09:00", "UTC", new Date("2026-10-01T00:00:00Z")).toISOString()).toBe("2027-02-28T09:00:00.000Z");
    expect(nextRun("yearly@02-29@09:00", "UTC", new Date("2027-03-01T00:00:00Z")).toISOString()).toBe("2028-02-29T09:00:00.000Z");
  });
  it("reads well", () => {
    expect(describeSchedule("monthly@15@10:00", en)).toBe("every month on day 15 at 10:00");
    expect(describeSchedule("yearly@02-15@09:30", en)).toBe("every year on Feb 15 at 09:30");
    expect(describeSchedule("monthly@15@10:00", ko)).toMatch(/15.*10:00/);
    expect(describeSchedule("yearly@02-15@09:30", ko)).toMatch(/2.*15.*09:30/);
  });
  it("«every month / every year» in the member's words counts as a time", () => {
    for (const t of ["remind me every month on the 1st", "yearly on March 3", "every year on my birthday"]) expect(askedTimed(t)).toBe(true);
  });
});
