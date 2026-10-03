import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { unrepeat } from "../lib/voice/unrepeat";

// Repeated dictation made one again (lib/voice/unrepeat.ts, ported from AI Soul lib/voice-heard).
// ① repeated text seen in real voice turns ② simulated Android dictation (every piece resends all heard so far · rewritten words · restarts)
const sq = (s: string) => s.replace(/[\s.,?!~…·'"«»「」()]/gu, "");

describe("운영에 실제로 들어온 겹친 글", () => {
  const cases: [string, string][] = [
    ["어어어 밤어 밤 12시어 밤 12시 말고어 밤 12시 말고어 밤 12시 말고 오후어 밤 12시 말고 오후어 밤 12시 말고 오후어 밤 12시 말고 오후 4시까지", "어 밤 12시 말고 오후 4시까지"],
    ["네이네이네이 부분네이 부분네이 부분네이 부분 개선하도록네이 부분 개선하도록네이 부분 개선하도록네이 부분 개선하도록 바로네이 부분 개선하도록 바로네이 부분 개선하도록 바로 수정해네이 부분 개선하도록 바로 수정해 주세요", "네이 부분 개선하도록 바로 수정해 주세요"],
    ["어어 이거는어 이거는어 이거는 지금어 이거는 지금어 이거는 지금어 이거는 지금어 이거는 지금 하지어 이거는 지금 하지 않고요", "어 이거는 지금 하지 않고요"],
    ["잠깐잠깐잠깐잠깐잠깐잠깐 그잠깐 그잠깐 그잠깐 그 대화잠깐 그 대화잠깐 그 대화 모드는잠깐 그 대화 모드는잠깐 그 대화 모드는 끄도록잠깐 그 대화 모드는 끄도록 하겠습니다", "잠깐 그 대화 모드는 끄도록 하겠습니다"],
    ["지금지금지금지금지금지금 무엇이라고지금 무엇이라고 했나요", "지금 무엇이라고 했나요"],
    // 앞 낱말을 짧게 고쳐 쓴 조각(«…계속해서» 뒤에 «…시뮬레이션을»)이 끼어도 한 판으로 본다
    ["네네 그리고네 그리고 자체적으로네 그리고 자체적으로 당신이 스스로 시뮬레이션을 계속해서네 그리고 자체적으로 당신이 스스로 시뮬레이션을네 그리고 자체적으로 당신이 스스로 시뮬레이션을 계속해서 대화를", "네 그리고 자체적으로 당신이 스스로 시뮬레이션을 계속해서 대화를"],
    ["그리고그리고 앞에 좋은 질문입니다그리고 앞에 좋은그리고 앞에 좋은 질문입니다나 이런그리고 앞에 좋은 질문입니다나 이런 상투적인 표현은 별로 안 써도 됩니다", "그리고 앞에 좋은 질문입니다나 이런 상투적인 표현은 별로 안 써도 됩니다"],
  ];
  it.each(cases)("%s", (raw, want) => { expect(unrepeat(raw)).toBe(want); });
});

describe("겹침이 아닌 말은 그대로", () => {
  it.each([
    "안녕하세요, 오늘 무슨 요일이에요?",
    "회의를 짧게 끝내는 좋은 방법 두 가지만 말해 주세요.",
    "카카오톡 채널 관리자 최신 매뉴얼 알려 주세요",
    "이 이모티콘 하나 만드는데 30분이 넘게 걸립니다",
    "온라인 12500000원, 매장 4300000원",
    "559204",
    "노트북에 설치되나요, 휴대폰에 설치되나요?",
    "오늘 날씨 어때요? 오늘 날씨 말고 내일 날씨요",
    "https://youtu.be/JI9YoLVuiE4?si=7OHON",
    "스스로 시뮬레이션을 계속해서 해 주세요",
    "",
  ])("%s", (t) => { expect(unrepeat(t)).toBe(t.trim()); });
});

// ── 흉내 받아쓰기 ────────────────────────────────────────────
function rng(seed: number): () => number { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 2 ** 32; }; }
const SAY = [
  "오늘 오후 네 시까지 대화 모드를 계속 고쳐 주세요",
  "지금 택배가 어디까지 왔는지 확인해서 알려 주세요",
  "어 그거 말고 어제 말한 동네 마트 할인 행사 건이요",
  "네 좋아요 그렇게 진행해 주세요",
  "잠깐만요 방금 뭐라고 하셨죠",
  "이번 달 전기 요금이랑 지난달 요금 비교해서 알려 줘",
  "그 당신과 제가 이야기 나누는 모든 것이 기록이 되고 나중에 제가 그걸 살펴보게 해 주세요",
  "음 이건 지금 하지 않고요 나중에 다시 얘기해요",
  "상투적인 이야기를 아예 빼라는 게 아니라 필요할 때만 하라는 거예요",
  "동생한테 내일 저녁 약속 취소한다고 문자 보내 줘",
  "대화 모드에서 제가 말하는 중에 끼어들지 않게 해 주세요",
  "아니에요 끼어드는 문제 고치는 일 하라는 이야기예요",
  "응 요즘은 그 일도 에이아이로 정리하는 게 너무 재밌어요",
  "10분에 한 번씩 점수를 매겨서 바로 개선해 주세요",
  "그리고 자체적으로 계속 업그레이드해서 기능을 개선해 주세요",
];
/** 안드로이드처럼 — 낱말을 하나씩 더한 «지금까지 들은 말 전체»를 조각마다 보낸다(같은 조각 되풀이 · 가끔 한 글자 빠진 고쳐 쓰기 · 가끔 한 단계 짧은 판) */
function androidStream(u: string, r: () => number): string {
  const w = u.split(" ");
  const out: string[] = [];
  for (let k = 1; k <= w.length; k++) {
    const piece = w.slice(0, k).join(" ");
    const times = 1 + Math.floor(r() * 4);
    for (let i = 0; i < times; i++) out.push(piece);
    if (k > 2 && k < w.length && r() < 0.15) out.push(w.slice(0, k - 1).join(" "));   // 한 단계 짧게 고쳐 씀
    if (k > 3 && k < w.length && r() < 0.1) { const last = w[k - 1]!; if (last.length > 2) out.push([...w.slice(0, k - 1), last.slice(1)].join(" ")); }   // 낱말 첫 글자를 놓친 판
  }
  return out.join("");
}

describe("흉내 받아쓰기로 되돌리기", () => {
  it("한 판(조각마다 앞말 전체) — 600번 중 모두 원래 말로", () => {
    const r = rng(20260929);
    let ok = 0; const bad: string[] = [];
    for (let i = 0; i < 600; i++) {
      const u = SAY[i % SAY.length]!;
      const got = unrepeat(androidStream(u, r));
      if (sq(got) === sq(u)) ok++; else if (bad.length < 5) bad.push(`${u} → ${got}`);
    }
    expect(bad).toEqual([]);
    expect(ok).toBe(600);
  });
  it("두 판(기기가 받아쓰기를 끝내고 다시 켬) — 앞 말과 뒤 말을 한 번씩 잇는다", () => {
    const r = rng(7);
    let ok = 0; const bad: string[] = [];
    for (let i = 0; i < 300; i++) {
      const a = SAY[i % SAY.length]!, b = SAY[(i * 7 + 3) % SAY.length]!;
      if (sq(b).startsWith(sq(a)) || sq(a).startsWith(sq(b)) || a[0] === b[0]) continue;
      const got = unrepeat(`${androidStream(a, r)} ${androidStream(b, r)}`);
      if (sq(got) === sq(`${a}${b}`)) ok++; else if (bad.length < 5) bad.push(`${a} | ${b} → ${got}`);
    }
    expect(bad).toEqual([]);
    expect(ok).toBeGreaterThan(200);
  });
  it("끝에 짧은 판이 늦게 한 번 더 붙어도(«…오후 4시네 그리고 자체») 온전한 판만", () => {
    const u = "네 그리고 자체적으로 당신이 스스로 시뮬레이션을 계속해서 기능을 개선해 주세요 오늘 오후 4시";
    expect(unrepeat(`${androidStream(u, rng(11))}네 그리고 자체`)).toBe(u);
  });
  it("세 판(받아쓰기가 두 번 다시 켜짐) — 열에 여덟 넘게 세 말을 한 번씩(9/29 흉내 측정 91%)", () => {
    const r = rng(33);
    let ok = 0, n = 0;
    for (let i = 0; i < 200; i++) {
      const us = [SAY[i % SAY.length]!, SAY[(i + 4) % SAY.length]!, SAY[(i + 9) % SAY.length]!];
      if (us.some((a, j) => j > 0 && sq(a)[0] === sq(us[j - 1]!)[0])) continue;
      n++;
      if (sq(unrepeat(us.map((u) => androidStream(u, r)).join(" "))) === sq(us.join(""))) ok++;
    }
    expect(ok / n).toBeGreaterThan(0.8);
  });
  it("컴퓨터 크롬처럼 조각이 겹치지 않고 따로 오면 그대로 잇는다", () => {
    for (const u of SAY) expect(sq(unrepeat(u))).toBe(sq(u));
  });
  it("같은 글자만 수만 자 이어진 글도 요청을 붙잡지 않는다(일 상한을 넘으면 그대로 둔다 · AI 검토 P1)", () => {
    for (const raw of ["네".repeat(30_000), "네 ".repeat(15_000), "그리고".repeat(9_000), "네".repeat(50_000)]) {
      const t0 = performance.now();
      const got = unrepeat(raw);
      expect(performance.now() - t0).toBeLessThan(1500);
      expect(got.length).toBeGreaterThan(0);
    }
  });
  it("아주 긴 겹침(1만 자 넘게)도 빨리(0.2초 안) 끝난다", () => {
    const long = SAY.join(" ");
    const raw = androidStream(long, rng(3));
    expect(raw.length).toBeGreaterThan(10_000);
    const t0 = performance.now();
    const got = unrepeat(raw);
    expect(performance.now() - t0).toBeLessThan(200);
    expect(sq(got)).toBe(sq(long));
  });
});

describe("other languages and the wiring", () => {
  it("English dictation repeated the Android way comes back once; plain English is kept", () => {
    expect(unrepeat("whatwhat timewhat time is itwhat time is it now")).toBe("what time is it now");
    expect(unrepeat("Please book a table for two at seven")).toBe("Please book a table for two at seven");
  });
  it("voice-mode turns are made one before anything sees them, and what was heard is kept with the question", () => {
    const t = readFileSync("lib/turn.ts", "utf8");
    expect(t).toMatch(/const heard = d\.voice && !d\.reminder \? unrepeat\(d\.text\) : d\.text;/);
    expect(t).toMatch(/insert into messages\(conversation_id, role, content, auto_turn, heard_raw\)/);
  });
});
