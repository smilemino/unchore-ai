import { describe, expect, it } from "vitest";
import { readVideoBlocks, toVideoSpec, VIDEO_GUIDE } from "@/lib/video";
import { looksCant, readGap } from "@/lib/gaps";
import { captionHtml, sceneHtml } from "../worker/video.mjs";

// 2026-10-02 owner: a member was told «video work can't be done — no outside connection». Video now goes through
// ```unchore-video``` blocks (lib/video.ts → worker/video.mjs), and «I can't» answers are caught as missing abilities (lib/gaps.ts).
describe("video blocks", () => {
  it("a scenes block becomes a spec and the answer shows the file name instead of the JSON", () => {
    const r = readVideoBlocks('Here it is.\n```unchore-video\n{"name":"홍보","size":"9:16","voice":true,"scenes":[{"text":"첫 장면","seconds":"3"},"둘째 장면",{"image":"a.jpg"}]}\n```\nDone.');
    expect(r.bad).toBe(0);
    expect(r.text).toContain("🎬 홍보.mp4");
    expect(r.text).not.toContain("scenes");
    expect(r.specs[0]).toMatchObject({ name: "홍보.mp4", format: "mp4", size: "9:16", voice: true });
    expect(r.specs[0]!.scenes).toEqual([{ text: "첫 장면", seconds: 3 }, { text: "둘째 장면" }, { image: "a.jpg" }]);
  });

  it("an edit block keeps the source, trim, speed and captions; GIF and MP3 get their own extension", () => {
    const e = toVideoSpec({ name: "cut.mp4", from: "clip.mov", trim: [5, 20], speed: 9, mute: true, captions: [{ from: 1, text: "hi" }], format: "gif" });
    expect(e).toMatchObject({ name: "cut.gif", format: "gif", from: ["clip.mov"], trim: [5, 20], speed: 4, mute: true, captions: [{ from: 1, to: 4, text: "hi" }] });
    expect(toVideoSpec({ from: ["x.mp4"], format: "mp3" })!.name).toBe("unchore.mp3");
  });

  it("a video asked for inside a file block is taken as a video, and a broken one is counted, not shown", () => {
    const r = readVideoBlocks('```unchore-file\n{"format":"mp4","name":"a","scenes":["x"]}\n```\n```unchore-video\n{"name":"b"\n```');
    expect(r.specs.map((s) => s.name)).toEqual(["a.mp4"]);
    expect(r.bad).toBe(1);
    expect(r.text).not.toContain("{");
  });

  it("the guide tells the AI never to say video can't be done", () => {
    expect(VIDEO_GUIDE).toMatch(/never say video work can't be done/);
  });

  it("scene and caption text is put into the page as text, never as HTML", () => {
    const h = sceneHtml({ text: "<script>alert(1)</script>", bg: "red;}body{x" }, [720, 1280], null);
    expect(h).not.toContain("<script>alert");
    expect(h).toContain("&lt;script&gt;");
    expect(h).toContain("background:#111827");   // a colour that isn't #hex falls back
    expect(captionHtml('"><img src=x>', [720, 1280])).not.toContain("<img");
  });

  it("scene text stays readable whatever colours the AI picks (white on beige was the first live video)", () => {
    expect(sceneHtml({ text: "a", bg: "#F3DEC2" }, [720, 1280], null)).toContain("color:#111827");
    expect(sceneHtml({ text: "a", bg: "#9D6047" }, [720, 1280], null)).toContain("color:#ffffff");
    expect(sceneHtml({ text: "a", bg: "#ffffff", color: "#eeeeee" }, [720, 1280], null)).toContain("color:#111827");
    expect(sceneHtml({ text: "a", bg: "#ffffff", color: "#c2410c" }, [720, 1280], null)).toContain("color:#c2410c");   // a readable choice is kept
  });
});

describe("can't-do answers", () => {
  it("an answer that opens with «can't» is looked at; one that does the work is not", () => {
    expect(looksCant("영상 작업은 외부 작업 연결이 안 되어서 할 수 없습니다.")).toBe(true);
    expect(looksCant("I'm unable to edit videos here.")).toBe(true);
    expect(looksCant("Here is your spreadsheet with 12 rows.")).toBe(false);
  });

  it("the small model's verdict keeps only a short ability name", () => {
    expect(readGap('```json\n{"gap":true,"ability":"make and edit short videos"}\n```')).toBe("make and edit short videos");
    expect(readGap('{"gap":false}')).toBeNull();
    expect(readGap("not json")).toBeNull();
  });
});

describe("empty video block next to an AI video card", () => {
  it("drops an empty unchore-video block and keeps the card line; the guide sends AI footage to the card", () => {
    const r = readVideoBlocks('Here.\n\n```unchore-video\n```\n\n<<<hf {"kind":"video","prompt":"a puppy on a beach"}>>>');
    expect(r.specs).toHaveLength(0);
    expect(r.bad).toBe(0);
    expect(r.text).not.toContain("unchore-video");
    expect(r.text).toContain("<<<hf ");
    expect(VIDEO_GUIDE).toMatch(/<<<hf/);
  });
});
