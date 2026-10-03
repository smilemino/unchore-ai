"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { PDF_FRAME_HASH, pdfPreviewPlan } from "@/lib/pdf-preview";
import { useT } from "./I18n";

// PDF first page (lib/pdf-preview.ts): computer → the browser's PDF viewer in a frame; phone → page 1 drawn as a picture
// with unpdf (already a dependency for reading PDFs, loaded only when needed). If it can't be drawn, only the name chip stays.
const WIDE = "(min-width: 768px)";   // same width as the md screen rule
const subscribeWide = (cb: () => void) => { const mq = window.matchMedia(WIDE); mq.addEventListener("change", cb); return () => mq.removeEventListener("change", cb); };
const readWide = () => window.matchMedia(WIDE).matches;

export default function PdfFirstPage({ name, size, href }: { name: string; size: number; href: string }) {
  const t = useT();
  const wide = useSyncExternalStore<boolean | null>(subscribeWide, readWide, () => null);
  const plan = pdfPreviewPlan(wide, size);
  const [img, setImg] = useState<string | null>(null);
  useEffect(() => {
    if (plan !== "image") return;
    let gone = false;
    void (async () => {
      try {
        const r = await fetch(href);
        if (!r.ok) return;
        const buf = new Uint8Array(await r.arrayBuffer());
        if (gone) return;
        const { renderPageAsImage } = await import("unpdf");
        const png = await renderPageAsImage(buf, 1, { toDataURL: true, width: 448 });
        if (!gone) setImg(png);
      } catch { /* can't draw it → the name chip alone */ }
    })();
    return () => { gone = true; };
  }, [plan, href]);

  const label = t("First page of {name}", { name });
  if (plan === "frame") return <iframe src={`${href}${PDF_FRAME_HASH}`} title={label} data-testid="attachment-pdf-frame" className="block w-56 h-72 rounded-lg border border-line bg-surface" />;
  // eslint-disable-next-line @next/next/no-img-element -- page 1 drawn in the browser (data: address)
  if (plan === "image" && img) return <img src={img} alt={label} data-testid="attachment-pdf-page" className="block w-56 max-h-72 rounded-lg border border-line object-cover object-top bg-white" />;
  return null;
}
