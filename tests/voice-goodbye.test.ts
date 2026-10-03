import { describe, expect, it } from "vitest";
import { afterTalkOver } from "@/lib/voice/goodbye";

describe("talking over the goodbye (AI Soul 624168d)", () => {
  it("the user's words during the goodbye call off closing and go on as the next message", () => {
    expect(afterTalkOver(true, true, "wait, one more thing")).toBe("send");
  });
  it("a mishear during the goodbye still closes voice mode", () => {
    expect(afterTalkOver(true, false, "bye")).toBe("close");
    expect(afterTalkOver(true, true, "  ")).toBe("close");
  });
  it("a mishear during a normal answer listens again", () => {
    expect(afterTalkOver(false, false, "")).toBe("listen");
    expect(afterTalkOver(false, true, "what about Busan")).toBe("send");
  });
});
