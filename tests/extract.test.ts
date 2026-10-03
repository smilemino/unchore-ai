// The AI reads attached Excel · Word · PowerPoint · PDF, not just plain text (10/1 owner «Unchore can't read Excel either»).
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { extractText, readable } from "@/lib/extract";

const zip = (files: Record<string, string>) => zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function pdf(text: string): Uint8Array {
  const stream = `BT /F1 24 Tf 72 720 Td (${text}) Tj ET`;
  const objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  let out = "%PDF-1.4\n"; const at: number[] = [];
  objs.forEach((o, i) => { at.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${at.map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
  return strToU8(out);
}

describe("attachments the AI can read", () => {
  it("Excel: every sheet's cells, shared strings included", async () => {
    const buf = zip({
      "xl/workbook.xml": '<workbook><sheets><sheet name="Sales" r:id="rId1"/></sheets></workbook>',
      "xl/_rels/workbook.xml.rels": '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
      "xl/sharedStrings.xml": "<sst><si><t>Apple</t></si><si><t>Pear</t></si></sst>",
      "xl/worksheets/sheet1.xml": '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>120</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>80</v></c></row></sheetData></worksheet>',
    });
    expect(await extractText("q3.xlsx", XLSX, buf)).toBe("## Sales\nApple\t120\nPear\t80");
  });
  it("Word and PowerPoint: their words", async () => {
    const docx = zip({ "word/document.xml": "<w:document><w:body><w:p><w:r><w:t>Hello</w:t></w:r><w:r><w:t> world</w:t></w:r></w:p></w:body></w:document>" });
    expect(await extractText("a.docx", "", docx)).toBe("Hello world");
    const pptx = zip({ "ppt/slides/slide1.xml": "<p:sld><a:p><a:r><a:t>Plan</a:t></a:r></a:p><a:p><a:r><a:t>Step one</a:t></a:r></a:p></p:sld>" });
    expect(await extractText("deck.pptx", "", pptx)).toBe("## Slide 1\nPlan\nStep one");
  });
  it("PDF: its text (AI Soul reads PDFs the same way)", async () => {
    expect(await extractText("memo.pdf", "application/pdf", pdf("Quarterly memo"))).toContain("Quarterly memo");
  });
  it("card numbers are masked in what comes out; unknown or broken files give nothing", async () => {
    const docx = zip({ "word/document.xml": "<w:p><w:t>card 4111 1111 1111 1111</w:t></w:p>" });
    expect(await extractText("c.docx", "", docx)).not.toContain("4111 1111 1111 1111");
    expect(await extractText("x.xlsx", XLSX, strToU8("not a zip"))).toBeNull();
    expect(readable("application/zip", "a.zip")).toBe(false);
  });
});
