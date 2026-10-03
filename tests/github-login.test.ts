import { describe, expect, it } from "vitest";
import { pickGithubEmail } from "@/lib/github-env";

describe("GitHub sign-in e-mail", () => {
  it("takes the verified primary address", () => {
    expect(pickGithubEmail([
      { email: "old@x.com", primary: false, verified: true },
      { email: "me@x.com", primary: true, verified: true },
    ])).toBe("me@x.com");
  });
  it("never uses an unverified address (accounts are matched by e-mail)", () => {
    expect(pickGithubEmail([{ email: "victim@x.com", primary: true, verified: false }])).toBeNull();
    expect(pickGithubEmail([{ email: "victim@x.com", primary: true, verified: false }, { email: "mine@x.com", primary: false, verified: true }])).toBe("mine@x.com");
  });
  it("skips GitHub's private relay address and bad input", () => {
    expect(pickGithubEmail([{ email: "1+me@users.noreply.github.com", primary: true, verified: true }])).toBeNull();
    expect(pickGithubEmail(null)).toBeNull();
    expect(pickGithubEmail({ message: "Bad credentials" })).toBeNull();
  });
});
