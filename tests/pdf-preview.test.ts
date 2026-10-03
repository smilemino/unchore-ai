import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PDF_PREVIEW_MAX_BYTES, isPdf, pdfPreviewPlan } from "@/lib/pdf-preview";

describe("PDF first page preview", () => {
  it("waits on the server, frames on a computer, draws a picture on a phone", () => {
    expect(pdfPreviewPlan(null, 1000)).toBe("wait");
    expect(pdfPreviewPlan(true, 1000)).toBe("frame");
    expect(pdfPreviewPlan(true, PDF_PREVIEW_MAX_BYTES * 3)).toBe("frame");
    expect(pdfPreviewPlan(false, 1000)).toBe("image");
  });
  it("a phone doesn't download a huge PDF just for the preview", () => {
    expect(pdfPreviewPlan(false, PDF_PREVIEW_MAX_BYTES)).toBe("image");
    expect(pdfPreviewPlan(false, PDF_PREVIEW_MAX_BYTES + 1)).toBe("none");
    expect(pdfPreviewPlan(false, 0)).toBe("none");
  });
  it("knows a PDF by its type, or by name when the type is missing", () => {
    expect(isPdf({ mime: "application/pdf", name: "a" })).toBe(true);
    expect(isPdf({ mime: "", name: "Report.PDF" })).toBe(true);
    expect(isPdf({ mime: "text/plain", name: "notes.pdf" })).toBe(false);
    expect(isPdf({ mime: "image/png", name: "a.png" })).toBe(false);
  });
  it("sent PDFs in the chat show the first page above the chip", () => {
    const chat = readFileSync("components/Chat.tsx", "utf8");
    expect(chat).toMatch(/isPdf\(f\)[\s\S]{0,300}<PdfFirstPage name=\{f\.name\} size=\{f\.size\} href=\{`\/api\/files\/\$\{f\.id\}\?view=1`\}/);
  });
  it("the file route serves PDFs inline so the frame can show them", () => {
    expect(readFileSync("app/api/files/[id]/route.ts", "utf8")).toContain("application\\/pdf");
  });
});
