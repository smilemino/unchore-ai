// PDF first page under a sent file (components/PdfFirstPage.tsx, from AI Soul): on a computer the browser's own PDF viewer in a frame,
// on a phone a picture of page 1 drawn in the browser with unpdf (some phone browsers show nothing for a PDF in a frame).
export const PDF_PREVIEW_MAX_BYTES = 30 * 1024 * 1024;   // bigger PDFs aren't downloaded whole just for a preview (name chip only)
export const PDF_FRAME_HASH = "#page=1&toolbar=0&navpanes=0&view=FitH";

export const isPdf = (f: { mime: string; name: string }) => f.mime === "application/pdf" || (!f.mime && /\.pdf$/i.test(f.name));

/** wide = computer-width screen (null while drawing on the server — wait, so nothing jumps). */
export function pdfPreviewPlan(wide: boolean | null, size: number): "wait" | "frame" | "image" | "none" {
  if (wide === null) return "wait";
  if (wide) return "frame";   // the frame streams the file itself, so size doesn't matter
  return size > 0 && size <= PDF_PREVIEW_MAX_BYTES ? "image" : "none";
}
