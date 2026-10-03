import { describe, expect, it } from "vitest";
import { screenLinks } from "@/lib/screen-links";

describe("screenLinks — «Go to that screen» buttons under an answer", () => {
  it("picks in-app links with their label", () => {
    expect(screenLinks("Open [Telegram](/app/settings?tab=ai#telegram) and press «Connect Telegram».")).toEqual([{ label: "Telegram", href: "/app/settings?tab=ai#telegram" }]);
    expect(screenLinks("[Automations](/app/automations)")).toEqual([{ label: "Automations", href: "/app/automations" }]);
  });
  it("leaves outside links and look-alikes in the text", () => {
    expect(screenLinks("[Get a key](https://console.anthropic.com/) · [x](/api/files/1) · [y](/application)")).toEqual([]);
    expect(screenLinks("[evil](/app/settings?tab=ai\"onload=x)")).toEqual([]);
  });
  it("shows each screen once and at most two", () => {
    const t = "[Files](/app/settings?tab=memory#my-files) · [**My files**](/app/settings?tab=memory#my-files) · [AI](/app/settings?tab=ai) · [Devices](/app/settings?tab=device)";
    expect(screenLinks(t)).toEqual([{ label: "Files", href: "/app/settings?tab=memory#my-files" }, { label: "AI", href: "/app/settings?tab=ai" }]);
  });
  it("cleans bold marks out of the label", () => {
    expect(screenLinks("[**Security check**](/app/settings?tab=ai#security-check)")[0]?.label).toBe("Security check");
  });
});
