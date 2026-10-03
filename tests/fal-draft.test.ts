import { afterEach, describe, expect, it, vi } from "vitest";
import { FAL_GUIDE, FINAL_IDX, HF_SETUP_GUIDE, MAX_USD, falVideoUsd } from "../lib/hf-ask";
import { FAL_DONE, FAL_T2V, FAL_UP, falCheck, falFinal, falSubmit } from "../lib/fal-video";

// «A 480p draft, then the same shot in 1080p» on the member's fal account (Seedance 2.5 Draft Mode — owner 2026-10-02: «bring the Artlist feature»).
type Call = { url: string; body: unknown };
function fakeFal(answers: unknown[]): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return new Response(JSON.stringify(answers.shift() ?? {}), { status: 200 });
  }));
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

describe("fal draft mode", () => {
  it.each([
    [FAL_T2V, "bytedance/seedance-2.5"],
    [FAL_DONE, "bytedance/seedance-2.5"],
    [FAL_UP, "fal-ai/bytedance-upscaler"],
  ])("retrieves accepted %s requests from the queue root, not the submission subpath", async (model, root) => {
    // The accepted 2026-10-02 requests returned these root paths. A submit path GET was HTTP 405.
    const calls: string[] = [];
    const base = `https://queue.fal.run/${root}/requests/accepted-request`;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      expect(init?.method).toBe("GET"); // never regenerate a video while recovering its result
      calls.push(url);
      if (url === `${base}/status`) return Response.json({ status: "COMPLETED" });
      if (url === base) return Response.json({ video: { url: "https://v3b.fal.media/result.mp4" }, draft_id: "d-9" });
      return new Response("Method Not Allowed", { status: 405 });
    }));
    expect(await falCheck("k", model, "accepted-request")).toEqual({ status: "done", url: "https://v3b.fal.media/result.mp4", draftId: "d-9" });
    expect(calls).toEqual([`${base}/status`, base]);
  });
  it("escapes a request id as one path segment and only polls while pending", async () => {
    const calls = fakeFal([{ status: "IN_QUEUE" }]);
    expect(await falCheck("k", FAL_T2V, "r/1?x")).toEqual({ status: "sent" });
    expect(calls).toEqual([{ url: "https://queue.fal.run/bytedance/seedance-2.5/requests/r%2F1%3Fx/status", body: undefined }]);
  });
  it("prices with the published formula — the 1080p of a draft is the full 1080p price", () => {
    expect(falVideoUsd("480p", 10)).toBe(2.056);          // = Higgsfield's $0.2056/s at 480p
    expect(falVideoUsd("1080p", 10)).toBe(11.3724);       // = $1.1372/s at 1080p
    expect(falVideoUsd("1080p", 15)).toBeLessThan(MAX_USD);
    expect(FINAL_IDX).toBeGreaterThan(20);                // the «same shot» row never clashes with a card (cards are 0–20)
  });
  it("sends a 480p card as a draft, other sizes straight, and in H.264 (10-bit/HEVC won't play on phones)", async () => {
    const calls = fakeFal([{ request_id: "r1" }, { request_id: "r2" }]);
    expect(await falSubmit("k", { kind: "video", prompt: "a dragon", res: "480p", seconds: 3, aspect: "16:9" })).toBe("r1");
    expect(calls[0]!.url).toBe(`https://queue.fal.run/${FAL_T2V}`);
    expect(calls[0]!.body).toEqual({ prompt: "a dragon", duration: "4", aspect_ratio: "16:9", codec: "H264", draft: true });
    await falSubmit("k", { kind: "video", prompt: "a dragon", res: "720p", seconds: 5, aspect: "9:16" });
    expect(calls[1]!.body).toMatchObject({ resolution: "720p", duration: "5" });
    expect(calls[1]!.body).not.toHaveProperty("draft");
  });
  it("finishes a draft from its id alone", async () => {
    const calls = fakeFal([{ request_id: "f1" }]);
    expect(await falFinal("k", "d-123")).toBe("f1");
    expect(calls[0]!.url).toBe(`https://queue.fal.run/${FAL_DONE}`);
    expect(calls[0]!.body).toEqual({ draft_id: "d-123", resolution: "1080p", codec: "H264" });
  });
  it("reads the file and the draft id when done, waits while queued, fails on FAILED", async () => {
    fakeFal([{ status: "COMPLETED" }, { video: { url: "https://v3b.fal.media/x.mp4" }, draft_id: "d-9", seed: 7 }]);
    expect(await falCheck("k", FAL_T2V, "r1")).toEqual({ status: "done", url: "https://v3b.fal.media/x.mp4", draftId: "d-9" });
    fakeFal([{ status: "IN_PROGRESS" }]);
    expect(await falCheck("k", FAL_T2V, "r1")).toEqual({ status: "sent" });
    fakeFal([{ status: "FAILED" }]);
    expect((await falCheck("k", FAL_T2V, "r1")).status).toBe("failed");
  });
  it("tells the AI the button, the full price, and how to connect fal", () => {
    expect(FAL_GUIDE).toMatch(/same shot in 1080p/);
    expect(FAL_GUIDE).toMatch(/not the difference/);
    expect(FAL_GUIDE).toMatch(/<<<hf \{"kind":"video"/);
    expect(HF_SETUP_GUIDE).toContain("<<<secret name=FAL_KEY>>>");
  });
});

describe("sharper, same video (upscale)", () => {
  it("costs about 7 cents for 10 s and asks ByteDance's upscaler for 1080p without redrawing", async () => {
    const { upscaleUsd, UP_IDX, FINAL_IDX: F } = await import("../lib/hf-ask");
    const { FAL_UP, falUpscale } = await import("../lib/fal-video");
    expect(upscaleUsd(10)).toBe(0.072);
    expect(UP_IDX).toBeGreaterThan(F + 20);   // never clashes with the «same shot» rows
    const calls = fakeFal([{ request_id: "u1" }]);
    expect(await falUpscale("k", "https://v3b.fal.media/a.mp4")).toBe("u1");
    expect(calls[0]!.url).toBe(`https://queue.fal.run/${FAL_UP}`);
    expect(calls[0]!.body).toMatchObject({ video_url: "https://v3b.fal.media/a.mp4", target_resolution: "1080p", enhancement_preset: "aigc" });
    expect(FAL_GUIDE).toMatch(/sharper, same video/);
  });
});
