// «No time given» → one tap (night 2026-10-01): the tap's own words must count as naming a time, or the loop never closes.
import { describe, expect, it } from "vitest";
import { askedTimedRecent, remindersGuide } from "@/lib/reminders";
import { describeSchedule } from "@/lib/schedule";
import { trFor } from "@/lib/i18n-server";
import { agreesToOffered, tappedTimePick, timePickLabel } from "@/lib/time-pick";

describe("the «Yes, switch it on — <when>» pick names a time", () => {
  for (const lang of ["ko", "en", "ja", "de", "es", "fr", "zh-CN", "pt", "ar", "hi"] as const) {
    it(lang, () => {
      const t = trFor(lang);
      for (const s of ["daily@09:00", "weekly@1@08:30", "days@12345@07:30"]) {
        const pick = timePickLabel(lang, describeSchedule(s, { lang, t }, "Asia/Seoul"));
        expect(askedTimedRecent([pick]) || tappedTimePick(pick, lang), `${lang} ${s}: ${pick}`).toBe(true);
      }
    });
  }
  it("is not fooled by other words", () => {
    expect(tappedTimePick("A different time", "en")).toBe(false);
    expect(tappedTimePick("Yes, switch it on", "en")).toBe(false);
    expect(tappedTimePick("다른 시간으로요", "ko")).toBe(false);
  });
});

// Night 2026-10-01 round 12: the pick was on screen, the member typed «좋아요, 그거 지금 켜 주세요» — agree to the offered time.
describe("typing «turn it on» after the pick", () => {
  const when = "매일 09:00";
  const prev = `매일 오전 9시에 확인할게요.\n\n<<<pick>>>\n- ${timePickLabel("ko", when)}\n- 다른 시간으로요\n<<<end>>>`;
  it("agrees when the previous answer offered that time", () => {
    expect(agreesToOffered("좋아요, 그거 지금 켜 주세요", prev, "ko", when)).toBe(true);
    expect(agreesToOffered("네", prev, "ko", when)).toBe(true);
    expect(agreesToOffered(timePickLabel("ko", when), prev, "ko", when)).toBe(true);
    expect(agreesToOffered("Sounds good — switch that on now", `x\n<<<pick>>>\n- ${timePickLabel("en", "every day at 09:00")}\n<<<end>>>`, "en", "every day at 09:00")).toBe(true);
  });
  it("not without that offer, or for another time, or for «a different time»", () => {
    expect(agreesToOffered("좋아요, 그거 지금 켜 주세요", "매일 오전 9시에 확인할게요.", "ko", when)).toBe(false);
    expect(agreesToOffered("좋아요, 그거 지금 켜 주세요", prev, "ko", "매일 18:00")).toBe(false);
    expect(agreesToOffered("다른 시간으로요", prev, "ko", when)).toBe(false);
  });
});

describe("the AI is told a self-chosen time still needs the member's tap (night 2026-10-01 round 13)", () => {
  it("in the reminders guide — only when they ask again; the first time, ask for the time (round 15)", () => {
    expect(remindersGuide()).toMatch(/When they ask again and you set it with a time you chose yourself, .*confirm that time with the button below — never say it is set/);
    expect(remindersGuide()).toMatch(/The first time a time is missing, ask for it/);
    expect(remindersGuide()).not.toMatch(/still add the block with that time/);
  });
});

