// Card numbers in uploads are masked on arrival (ported from AI Soul, 2026-09-30 sync).
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { looksLikeCard, maskCardsInFile, maskCardsInText } from "@/lib/card-mask";

describe("card numbers in uploaded text", () => {
  it("keeps only the last 4 digits of a real-looking card", () => {
    expect(maskCardsInText("카드 4111 1111 1111 1111 로 결제").text).toBe("카드 **** **** **** 1111 로 결제");
    expect(maskCardsInText("card 5500-0000-0000-0004").text).toBe("card ****-****-****-0004");
  });
  it("leaves order numbers, phone numbers and prices alone", () => {
    const s = "order 1234567890123 · tel 010-1234-5678 · 294,690원 · 2026-09-30";
    expect(maskCardsInText(s)).toEqual({ text: s, count: 0 });
    expect(looksLikeCard("4111111111111112")).toBe(false);   // fails the Luhn check
  });
  it("masks inside a legacy Korean (EUC-KR) CSV without touching other characters", () => {
    const euckrName = Buffer.from([0xc0, 0xcc, 0xb8, 0xa7]);   // «이름»
    const file = Buffer.concat([euckrName, Buffer.from(",4111111111111111\n", "latin1")]);
    const out = maskCardsInFile(file);
    expect(out.count).toBe(1);
    expect(out.data.subarray(0, 4).equals(euckrName)).toBe(true);
    expect(out.data.toString("latin1").endsWith(",************1111\n")).toBe(true);
  });
  it("leaves PDF files as they are, and masking twice changes nothing", () => {
    const pdf = Buffer.from("%PDF-1.7 4111111111111111");
    expect(maskCardsInFile(pdf).data).toBe(pdf);
    const once = maskCardsInFile(Buffer.from("4111111111111111")).data;
    expect(maskCardsInFile(once).count).toBe(0);
  });
});

describe("card numbers inside Office files (xlsx/docx/pptx are zip files)", () => {
  const sheet = '<worksheet><sheetData><row r="1"><c r="A1"><v>4111111111111111</v></c><c r="B1"><v>1234567890123</v></c><c r="C1" t="s"><v>0</v></c></row></sheetData></worksheet>';
  it("turns a numeric Excel card cell into a masked text cell and leaves other cells alone", () => {
    const xlsx = Buffer.from(zipSync({ "[Content_Types].xml": strToU8("<Types/>"), "xl/worksheets/sheet1.xml": strToU8(sheet), "xl/sharedStrings.xml": strToU8("<sst><si><t>5500 0000 0000 0004</t></si></sst>"), "xl/media/a.png": new Uint8Array([0x89, 0x50, 0, 1]) }));
    const out = maskCardsInFile(xlsx);
    expect(out.count).toBe(2);
    const e = unzipSync(new Uint8Array(out.data));
    const s1 = strFromU8(e["xl/worksheets/sheet1.xml"]!);
    expect(s1).toContain('<c r="A1" t="inlineStr"><is><t>************1111</t></is></c>');
    expect(s1).toContain('<c r="B1"><v>1234567890123</v></c>');
    expect(strFromU8(e["xl/sharedStrings.xml"]!)).toContain("**** **** **** 0004");
    expect(Array.from(e["xl/media/a.png"]!)).toEqual([0x89, 0x50, 0, 1]);
    expect(maskCardsInFile(out.data).count).toBe(0);
  });
  it("masks Word text and returns the very same buffer when a zip has no card", () => {
    const docx = Buffer.from(zipSync({ "word/document.xml": strToU8("<w:t>카드 4111-1111-1111-1111</w:t>") }));
    expect(strFromU8(unzipSync(new Uint8Array(maskCardsInFile(docx).data))["word/document.xml"]!)).toContain("****-****-****-1111");
    const clean = Buffer.from(zipSync({ "ppt/slides/slide1.xml": strToU8("<a:t>010-1234-5678</a:t>") }));
    expect(maskCardsInFile(clean).data).toBe(clean);
    const broken = Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
    expect(maskCardsInFile(broken).data).toBe(broken);
  });
});
