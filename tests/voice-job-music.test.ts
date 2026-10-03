// Voice mode keeps the piano on while a job left running is at work, turned down while Unchore speaks or the member talks (AI Soul 31c841c).
import { describe, it, expect } from "vitest";
import { musicCrumb, musicPlan, type MusicState } from "../lib/voice/job-music";

const base: MusicState = { voice: true, busy: false, jobs: 0, saying: false, talking: false, hidden: false, call: false };
const plan = (o: Partial<MusicState>) => musicPlan({ ...base, ...o });

describe("music while a job left running is at work", () => {
  it("plays while a job runs, even with no answer being made", () => {
    expect(plan({ jobs: 1 })).toBe("full");
    expect(plan({})).toBe("off");
  });
  it("turns down, not off, while Unchore speaks or the member talks", () => {
    expect(plan({ jobs: 1, saying: true })).toBe("low");
    expect(plan({ jobs: 2, talking: true })).toBe("low");
  });
  it("the answer's own music: on while it is made, down while the member talks, off once it is read", () => {
    expect(plan({ busy: true })).toBe("full");
    expect(plan({ busy: true, talking: true })).toBe("low");
    expect(plan({ busy: true, saying: true })).toBe("off");
  });
  it("off outside voice mode, during a phone call, and for a job while the page is out of sight", () => {
    expect(plan({ voice: false, jobs: 1 })).toBe("off");
    expect(plan({ jobs: 1, call: true })).toBe("off");
    expect(plan({ jobs: 1, hidden: true })).toBe("off");
  });
  it("a one-letter scrap heard over the music is not sent", () => {
    expect(musicCrumb(" a ", true)).toBe(true);
    expect(musicCrumb("ok", true)).toBe(false);
    expect(musicCrumb("a", false)).toBe(false);
  });
});
