import { describe, expect, it } from "vitest";
import { isLocked, lock, lockBytes, ref, scrub, unlock, unlockBytes } from "../lib/privacy";

describe("locking chat text at rest", () => {
  it("round-trips and hides the text", () => {
    const s = lock("내 여권 번호 알려 줄게");
    expect(s.startsWith("enc:")).toBe(true);
    expect(s).not.toContain("여권");
    expect(isLocked(s)).toBe(true);
    expect(unlock(s)).toBe("내 여권 번호 알려 줄게");
  });
  it("reads rows written before locking as they are", () => {
    expect(unlock("plain old message")).toBe("plain old message");
    expect(unlock(null)).toBe("");
  });
  it("does not crash on a damaged box", () => {
    expect(unlock("enc:v1.bad.box.here")).toMatch(/locked/);
  });
  it("locks file bytes", () => {
    const b = Buffer.from("hello file");
    const l = lockBytes(b);
    expect(l.includes(b)).toBe(false);
    expect(unlockBytes(l).toString()).toBe("hello file");
    expect(unlockBytes(Buffer.from("old plain bytes")).toString()).toBe("old plain bytes");
  });
  it("makes one-way references that stay the same", () => {
    expect(ref("abc")).toBe(ref("abc"));
    expect(ref("abc")).not.toBe(ref("abd"));
    expect(ref("abc", "c")).not.toBe(ref("abc"));
    expect(ref("abc")).not.toContain("abc");
  });
});

describe("scrubbing personal details from the improvement copy", () => {
  const cases: Array<[string, string, string]> = [
    ["email", "mail me at jane.doe+x@example.co.uk please", "mail me at [email] please"],
    ["kr phone", "제 번호는 010-1234-5678 입니다", "제 번호는 [phone] 입니다"],
    ["us phone", "call +1 (415) 555-0132 now", "call [phone] now"],
    ["card", "card 4111 1111 1111 1111 exp", "card [card] exp"],
    ["kr id", "주민번호 900101-1234567", "주민번호 [id-number]"],
    ["ssn", "SSN 123-45-6789", "SSN [id-number]"],
    ["password", "my password is hunter22!", "my password is [password]"],
    ["kr password", "비밀번호는 qwer1234", "비밀번호는 [password]"],
    ["name en", "Hi, my name is John Smith.", "Hi, my name is [name]."],
    ["name ko", "제 이름은 홍길동 입니다", "제 이름은 [name] 입니다"],
    ["name ko particle", "제 이름은 홍길동이고 서울 살아요", "제 이름은 [name]이고 서울 살아요"],
    ["api key", "key sk-ant-api03-abcdefghijklmnop", "key [key]"],
    ["link", "see https://x.com/a?token=abc", "see [link]"],
    ["kr address", "서울 강남구 테헤란로 123 가 주소", "서울 강남구 [address] 가 주소"],
    ["us address", "ship to 1600 Pennsylvania Avenue please", "ship to [address] please"],
  ];
  for (const [name, input, want] of cases) it(name, () => expect(scrub(input)).toBe(want));

  it("removes what we already know about the user", () => {
    expect(scrub("Jane Doe asked about Jane's trip", ["Jane Doe", "jane@example.com"])).toBe("[name] asked about [name]'s trip");
    expect(scrub("박영희 님 일정", ["박영희"])).toBe("[name] 님 일정");
  });
  it("leaves ordinary text alone", () => {
    const t = "How do I book a flight from Gimpo to Jeju on 10/13 under 50,000 won?";
    expect(scrub(t, ["Ho Lee"])).toBe(t);
    expect(scrub("에어팟 최저가 294,670원 알려 줘")).toBe("에어팟 최저가 294,670원 알려 줘");
  });
});
