// Batch 21 (owner «yes» 2026-09-30 08:55): the member's Google account — Calendar, Gmail, Drive; actions only after «Yes».
import { describe, expect, it } from "vitest";
import { connectUrl, servicesOf, GOOGLE_SCOPES } from "@/lib/google-connect";
import { readGoogleActions, hideGoogleMarks } from "@/lib/google-act";
import { rawMail } from "@/lib/google-api";
import { wantsGoogle, GOOGLE_GUIDE } from "@/lib/google-lookup";
import { hideMarks } from "@/lib/chat-setup";

describe("google scopes stay out of «restricted» (no yearly CASA audit — owner 2026-10-01)", () => {
  const RESTRICTED = /gmail\.readonly|gmail\.metadata|gmail\.modify|gmail\.compose|mail\.google\.com|drive\.readonly|\/auth\/drive$|drive\.metadata/;
  it("asks only for sensitive or non-sensitive scopes", () => {
    for (const s of Object.values(GOOGLE_SCOPES).flat()) expect(s).not.toMatch(RESTRICTED);
    const u = new URL(connectUrl("https://unchore.ai/api/auth/google/callback", ["calendar", "gmail", "drive"], "c:x", "ch"));
    expect(u.searchParams.get("scope")).not.toMatch(RESTRICTED);
    expect(u.searchParams.get("include_granted_scopes")).toBeNull();
  });
  it("tells the AI it can't read the inbox", () => {
    expect(GOOGLE_GUIDE(["gmail"])).toContain("can't read their mail inbox");
    expect(GOOGLE_GUIDE(["calendar", "drive"])).toContain("Drive files they picked");
  });
});

describe("google connection", () => {
  it("asks only for the services picked, offline, through the sign-in address", () => {
    const u = new URL(connectUrl("https://unchore.ai/api/auth/google/callback", ["calendar"], "c:abc", "ch", "a@b.c"));
    expect(u.searchParams.get("scope")).toBe(`openid email ${GOOGLE_SCOPES.calendar.join(" ")}`);
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("redirect_uri")).toBe("https://unchore.ai/api/auth/google/callback");
    expect(u.searchParams.get("state")).toBe("c:abc");
  });
  it("a service counts only when all its scopes were granted", () => {
    expect(servicesOf(`openid ${GOOGLE_SCOPES.calendar[0]}`)).toEqual(["calendar"]);
    expect(servicesOf([...GOOGLE_SCOPES.gmail, ...GOOGLE_SCOPES.drive].join(" "))).toEqual(["gmail", "drive"]);
  });
  it("hears mail / calendar / files questions in several languages", () => {
    expect(wantsGoogle("내일 일정 뭐 있어?", ["calendar", "gmail"])).toEqual(["calendar"]);
    expect(wantsGoogle("Any unread mail from Bob?", ["calendar", "gmail"])).toEqual([]);   // mail is send-only (2026-10-01)
    expect(wantsGoogle("What's the dollar rate?", ["calendar", "gmail", "drive"])).toEqual([]);
    expect(GOOGLE_GUIDE(["calendar"])).toContain("calendar.add");
    expect(GOOGLE_GUIDE(["calendar"])).not.toContain("gmail.send");
    expect(GOOGLE_GUIDE(["calendar"])).toContain("propose adding it even if they didn't ask");   // dates settled in a chat or call (soul 2026-10-02)
    expect(GOOGLE_GUIDE(["gmail"])).not.toContain("propose adding it");
  });
});

describe("«Yes» cards", () => {
  const ans = 'I can add it.\n<<<google {"do":"calendar.add","title":"Dentist","start":"2026-10-02T15:00:00+09:00"}>>>\n<<<google {"do":"gmail.send","to":"bob@example.com","subject":"Hi","body":"See you"}>>>\n<<<google {"do":"drive.delete","id":"x"}>>>';
  it("reads valid proposals in order; unknown or broken ones are skipped", () => {
    expect(readGoogleActions(ans).map((a) => a.do)).toEqual(["calendar.add", "gmail.send"]);
    expect(readGoogleActions('<<<google {"do":"gmail.send","to":"not-an-email","subject":"x","body":"y"}>>>')).toEqual([]);
  });
  it("the lines never show in the answer", () => {
    expect(hideGoogleMarks(ans)).toBe("I can add it.");
    expect(hideMarks(ans)).toBe("I can add it.");
  });
  it("a mail in any language arrives intact", () => {
    const raw = Buffer.from(rawMail("bob@example.com", "안녕하세요 회의", "내일 봬요"), "base64url").toString("utf8");
    expect(raw).toContain(`Subject: =?UTF-8?B?${Buffer.from("안녕하세요 회의").toString("base64")}?=`);
    expect(raw).toContain("charset=UTF-8");
    expect(raw.endsWith("내일 봬요")).toBe(true);
  });
});
