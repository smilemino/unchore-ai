import { afterEach, describe, expect, it } from "vitest";
import { isOwnerEmail } from "@/lib/youtube-connect";

describe("youtube connect is owner only", () => {
  const was = process.env.OWNER_EMAILS;
  afterEach(() => { process.env.OWNER_EMAILS = was; });
  it("matches OWNER_EMAILS, any case, and nobody when unset", () => {
    process.env.OWNER_EMAILS = "a@x.com, Boss@Y.com";
    expect(isOwnerEmail("boss@y.com")).toBe(true);
    expect(isOwnerEmail("member@y.com")).toBe(false);
    expect(isOwnerEmail(null)).toBe(false);
    process.env.OWNER_EMAILS = "";
    expect(isOwnerEmail("boss@y.com")).toBe(false);
  });
});
