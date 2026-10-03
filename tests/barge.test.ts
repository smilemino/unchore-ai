import { describe, expect, it } from "vitest";
import { bargeCheck, bargeFinal, bargeReal, stopOnly, wordsOf } from "@/lib/voice/barge";

const spoken = "Tomorrow's weather in Seoul is sunny with a high of 24 degrees, so a light jacket is enough.";
describe("talking over the voice", () => {
  it("our own reading picked up by the mic is not the user", () => {
    expect(bargeCheck("tomorrow weather in Seoul is sunny", spoken).hit).toBe(false);
    expect(bargeCheck("um ok", spoken).hit).toBe(false);
  });
  it("new words or «stop» are the user", () => {
    const b = bargeCheck("sunny with a high wait what about Busan tomorrow", spoken);
    expect(b.hit).toBe(true);
    expect(b.user).toBe("wait what about Busan tomorrow");
    expect(bargeCheck("stop", spoken).stop).toBe(true);
    expect(bargeCheck("잠깐만요", "서울은 내일 맑아요").hit).toBe(true);
  });
  it("words without spaces are cut too", () => { expect(wordsOf("東京の天気").length).toBeGreaterThan(1); });
  it("a short mishear is not real unless they keep talking", () => {
    const at = bargeCheck("blue sky", spoken);
    expect(bargeReal(at, bargeCheck("blue sky", spoken))).toBe(false);
    expect(bargeReal(at, bargeCheck("blue sky please tell me about Busan instead", spoken))).toBe(true);
  });
  it("a finished piece with no partial words: only the user's words at the end count (AI Soul bargeFinal)", () => {
    // the speaker misheard in the middle, our own words last — not the user
    expect(bargeFinal("tomorrow weather blue sky in Seoul is sunny with a high", spoken).hit).toBe(false);
    // the user's words come last — they talked over the reading
    const f = bargeFinal("sunny with a high what about Busan", spoken);
    expect(f.hit).toBe(true);
    expect(f.user).toBe("what about Busan");
    expect(bargeFinal("light jacket is enough 잠깐만요", spoken).hit).toBe(true);
  });
  it("«stop» typed alone stops the answer; a sentence with it doesn't", () => {
    for (const x of ["멈춰", "그만", "/stop", "stop", "Stop!", "멈춰 주세요"]) expect(stopOnly(x)).toBe(true);
    for (const x of ["그만 쓰고 요약해 줘", "stop using bullet points please and write prose", "", "hello"]) expect(stopOnly(x)).toBe(false);
  });
});
