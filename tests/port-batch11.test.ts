// Batch 11 (2026-09-30 sync): files follow the member (slide language, blank-sheet name, Letter or A4), not Korea by default.
import { unzipSync, strFromU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { makeFiles } from "@/lib/files";
import { fileLocale } from "@/lib/files/types";
import { LANGS } from "@/lib/i18n";
import { tr } from "@/lib/i18n-server";

const one = (block: object, loc = fileLocale("en", "America/New_York")) => makeFiles("```unchore-file\n" + JSON.stringify(block) + "\n```", loc).files[0]!;
const entry = (buf: Buffer, name: string) => strFromU8(unzipSync(new Uint8Array(buf))[name]!);

describe("files follow the member", () => {
  it("picks Letter paper for North America and A4 elsewhere", () => {
    expect(fileLocale("en", "America/Chicago").letter).toBe(true);
    expect(fileLocale("en", "America/Sao_Paulo").letter).toBe(false);
    expect(fileLocale("en", "Europe/London").letter).toBe(false);
    expect(fileLocale("ko", "Asia/Seoul")).toEqual({ lang: "ko", letter: false, sheet: "표" });
    expect(fileLocale("de", "Europe/Berlin").lang).toBe("de");   // every app language, not just ko/en (2026-09-30)
  });
  it("Word: Letter for a US member, A4 for a Korean one", () => {
    const d = { format: "docx", name: "Notice", paragraphs: [{ text: "Hi" }] };
    expect(entry(one(d).data, "word/document.xml")).toContain('w:w="12240" w:h="15840"');
    expect(entry(one(d, fileLocale("ko", "Asia/Seoul")).data, "word/document.xml")).toContain('w:w="11906" w:h="16838"');
  });
  it("slides are marked English or Korean, blank sheets named in the member's language", () => {
    expect(entry(one({ format: "pptx", name: "Intro", slides: [{ title: "Hi" }] }).data, "ppt/slides/slide1.xml")).toContain('lang="en-US"');
    expect(entry(one({ format: "xlsx", name: "T", sheets: [{ rows: [["a"]] }] }).data, "xl/workbook.xml")).toContain('name="Sheet1"');
    expect(entry(one({ format: "xlsx", name: "T", sheets: [{ rows: [["a"]] }] }, fileLocale("ko", "Asia/Seoul")).data, "xl/workbook.xml")).toContain('name="표1"');
    expect(entry(one({ format: "pptx", name: "Intro", slides: [{ title: "Hi" }] }, fileLocale("ja", "Asia/Tokyo")).data, "ppt/slides/slide1.xml")).toContain('lang="ja-JP"');
  });
  it("PDF page is Letter for a US member", () => {
    expect(one({ format: "pdf", name: "N", paragraphs: [{ text: "Hi" }] }).data.toString("latin1")).toContain("/MediaBox [0 0 612 792]");
  });
  it("the English landing example no longer uses won", () => {
    for (const l of LANGS.filter((x) => x.code !== "ko")) {   // only Korean keeps the Korean price-site example
      expect(`${tr(l.code, "$64,210 on Coinbase — spot price, read just now.")} ${tr(l.code, "Want me to check every morning and tell you when it drops under $60,000?")}`).not.toMatch(/₩|원/);
    }
  });
});
