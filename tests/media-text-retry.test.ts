// YouTube read on Google's own door (lib/media-text.ts youtubeWords · 2026-10-03): when the free tier answers 503 «high demand» the
// next flash model is asked; a key Google refuses (400/403) isn't tried again on the other models.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ one: async () => ({ tz: "Asia/Seoul" }), q: async () => [] }));
vi.mock("@/lib/ai", () => ({ userKeys: async () => ({}) }));
vi.mock("@/lib/credits", () => ({ charge: async () => ({ charged: 0 }), houseKey: () => "" }));

const ok = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });

describe("YouTube read: busy Google models", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("503 on the first model → the next one answers", async () => {
    vi.stubEnv("UNCHORE_GEMINI_FREE_KEY", "free-k"); vi.stubEnv("BROWSER_WORKER_URL", "");
    const asked: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (u: string) => { asked.push(u); return asked.length === 1 ? new Response("{}", { status: 503 }) : ok("here we are in front of the elephants"); }));
    const { youtubeWords } = await import("@/lib/media-text");
    expect(await youtubeWords("m", "https://www.youtube.com/watch?v=jNQXAC9IVRw")).toEqual({ words: { text: "here we are in front of the elephants", source: "read by Gemini" } });
    expect(asked.map((u) => u.split("/models/")[1])).toEqual(["gemini-flash-latest:generateContent", "gemini-3.5-flash:generateContent"]);
  });

  it("a refused key isn't tried on the other models", async () => {
    vi.stubEnv("UNCHORE_GEMINI_FREE_KEY", "free-k"); vi.stubEnv("BROWSER_WORKER_URL", "");
    const f = vi.fn(async () => new Response("{}", { status: 400 }));
    vi.stubGlobal("fetch", f);
    const { youtubeWords } = await import("@/lib/media-text");
    expect(await youtubeWords("m", "https://www.youtube.com/watch?v=jNQXAC9IVRw")).toEqual({ why: "failed" });
    expect(f).toHaveBeenCalledTimes(1);
  });
});
