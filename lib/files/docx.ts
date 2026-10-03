// 워드(docx) 굽기 — 마디마다 글씨 크기·굵기를 직접 준다(공용 모양표 파일이 없어도 워드가 연다).
import { zip, xe, type ZipEntry } from "./zip";
import { DEFAULT_LOCALE, type FileLocale, type DocxSpec } from "./types";

const SIZE = { title: 40, heading: 28, body: 22 };   // 반(半)포인트 — 20pt · 14pt · 11pt

function para(text: string, style: "title" | "heading" | "body"): string {
  const sz = SIZE[style];
  const bold = style === "body" ? "" : "<w:b/>";
  const lines = String(text).split("\n");
  const runs = lines.map((l, i) => `${i > 0 ? "<w:r><w:br/></w:r>" : ""}<w:r><w:rPr>${bold}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr><w:t xml:space="preserve">${xe(l)}</w:t></w:r>`).join("");
  return `<w:p><w:pPr><w:spacing w:after="160"/></w:pPr>${runs}</w:p>`;
}

export function buildDocx(spec: DocxSpec, loc: FileLocale = DEFAULT_LOCALE): Buffer {
  const page = loc.letter ? 'w:w="12240" w:h="15840"' : 'w:w="11906" w:h="16838"';   // Letter or A4, in twentieths of a point
  const body = (spec.paragraphs ?? []).map((p) => para(p.text ?? "", p.style ?? "body")).join("");
  const entries: ZipEntry[] = [
    { name: "[Content_Types].xml", data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`, "utf8") },
    { name: "_rels/.rels", data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`, "utf8") },
    { name: "word/document.xml", data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz ${page}/><w:pgMar w:top="1418" w:right="1134" w:bottom="1418" w:left="1134"/></w:sectPr></w:body></w:document>`, "utf8") },
  ];
  return zip(entries);
}
