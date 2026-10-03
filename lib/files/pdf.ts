// PDF 굽기 — 한글이 나오게 글꼴을 파일 안에 함께 넣는다(Identity-H). 부품을 새로 깔지 않고 직접 적는다.
import { existsSync } from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { loadFont, subsetFont, type Font } from "./ttf";
import { DEFAULT_LOCALE, type FileLocale, type PdfSpec } from "./types";

const A4 = { w: 595.28, h: 841.89, margin: 56.7 };
const LETTER = { w: 612, h: 792, margin: 56.7 };
const SIZE = { title: 20, heading: 14, body: 11 };

/** Font path — the setting first, then the font in this repo, then a system font. */
export function resolveFontPath(): string {
  const cands = [
    process.env.UNCHORE_PDF_FONT,
    path.join(process.cwd(), "lib/files/assets/NanumGothic.ttf"),
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  ].filter((x): x is string => !!x);
  for (const c of cands) if (existsSync(c)) return c;
  throw new Error("no font file for PDF");
}

interface Line { text: string; size: number; gap: number }

function gidsOf(f: Font, s: string): number[] {
  const out: number[] = [];
  for (const ch of s) out.push(f.cmap.get(ch.codePointAt(0)!) ?? 0);
  return out;
}
function widthOf(f: Font, gids: number[], size: number): number {
  let w = 0;
  for (const g of gids) w += (f.widths[g] ?? f.unitsPerEm) / f.unitsPerEm * size;
  return w;
}

/** 한 마디를 칸 너비에 맞춰 줄로 나눈다(한글은 글자 단위, 영문은 낱말 단위). */
export function wrap(f: Font, text: string, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const raw of String(text).split("\n")) {
    let cur = "";
    const push = () => { out.push(cur); cur = ""; };
    for (const ch of raw) {
      const next = cur + ch;
      if (widthOf(f, gidsOf(f, next), size) > maxWidth && cur) {
        const sp = /[가-힣]/.test(ch) ? -1 : cur.lastIndexOf(" ");
        if (sp > 0) { const tail = cur.slice(sp + 1); out.push(cur.slice(0, sp)); cur = tail + ch; }
        else { push(); cur = ch; }
      } else cur = next;
    }
    out.push(cur);
  }
  return out;
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

export function buildPdf(spec: PdfSpec, fontPath = resolveFontPath(), loc: FileLocale = DEFAULT_LOCALE): Buffer {
  const P = loc.letter ? LETTER : A4;
  const f = loadFont(fontPath);
  const textWidth = P.w - P.margin * 2;
  const lines: Line[] = [];
  for (const p of spec.paragraphs ?? []) {
    const size = SIZE[p.style ?? "body"];
    for (const l of wrap(f, p.text ?? "", size, textWidth)) lines.push({ text: l, size, gap: size * 1.6 });
    lines.push({ text: "", size, gap: size * 0.8 });
  }
  // 쪽 나누기
  const pages: Line[][] = [];
  let cur: Line[] = []; let y = P.h - P.margin;
  for (const l of lines) {
    if (y - l.gap < P.margin) { pages.push(cur); cur = []; y = P.h - P.margin; }
    cur.push(l); y -= l.gap;
  }
  pages.push(cur);

  const used = new Set<number>();
  const contents = pages.map((ls) => {
    let yy = P.h - P.margin; const parts: string[] = [];
    for (const l of ls) {
      if (l.text) {
        const gids = gidsOf(f, l.text);
        gids.forEach((g) => used.add(g));
        const hex = gids.map((g) => g.toString(16).padStart(4, "0")).join("");
        parts.push(`BT /F1 ${l.size.toFixed(2)} Tf ${P.margin.toFixed(2)} ${(yy - l.size).toFixed(2)} Td <${hex}> Tj ET`);
      }
      yy -= l.gap;
    }
    return Buffer.from(parts.join("\n"), "latin1");
  });

  const sub = subsetFont(f, used);
  const packed = deflateSync(sub);
  const sorted = [...used].filter((g) => g > 0).sort((a, b) => a - b);
  const W = sorted.map((g) => `${g} [${Math.round((f.widths[g] ?? f.unitsPerEm) * 1000 / f.unitsPerEm)}]`).join(" ");
  const uni = new Map<number, string>();
  // 제어문자는 건너뛴다 — 같은 글자 번호를 가리키는 낮은 번호가 먼저 잡히면 빈칸이 깨져 보인다(실측 2026-09-23)
  for (const [c, g] of f.cmap) if (c >= 0x20 && used.has(g) && !uni.has(g)) uni.set(g, c <= 0xffff ? c.toString(16).padStart(4, "0") : [0xd800 + ((c - 0x10000) >> 10), 0xdc00 + ((c - 0x10000) & 0x3ff)].map((x) => x.toString(16).padStart(4, "0")).join(""));
  const bf = [...uni.entries()].map(([g, u]) => `<${g.toString(16).padStart(4, "0")}> <${u}>`);
  const bfChunks: string[] = [];
  for (let i = 0; i < bf.length; i += 100) bfChunks.push(`${Math.min(100, bf.length - i)} beginbfchar\n${bf.slice(i, i + 100).join("\n")}\nendbfchar`);
  const toUni = Buffer.from(`/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n${bfChunks.join("\n")}\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`, "latin1");

  const objs: Buffer[] = [];
  const add = (b: string | Buffer) => { objs.push(Buffer.isBuffer(b) ? b : Buffer.from(b, "latin1")); return objs.length; };
  const stream = (dict: string, data: Buffer) => add(Buffer.concat([Buffer.from(`<< ${dict} /Length ${data.length} >>\nstream\n`, "latin1"), data, Buffer.from("\nendstream", "latin1")]));
  const nPages = pages.length;
  const firstContent = 4;                             // 1 목록 · 2 쪽묶음 · 3 글꼴(Type0) · 4.. 내용
  const contentIds = contents.map(() => 0);
  const kidIds: number[] = [];
  add("<< /Type /Catalog /Pages 2 0 R >>");
  add("");                                            // 2번은 마지막에 채운다
  add("");                                            // 3번(글꼴)도 마지막에
  contents.forEach((c, i) => { contentIds[i] = stream("", c); });
  for (let i = 0; i < nPages; i++) kidIds.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${P.w} ${P.h}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentIds[i]} 0 R >>`));
  const fileId = stream(`/Length1 ${sub.length} /Filter /FlateDecode`, packed);
  const toUniId = stream("", toUni);
  const fd = add(`<< /Type /FontDescriptor /FontName /SoulFont /Flags 4 /FontBBox [${f.bbox.map((v) => Math.round(v * 1000 / f.unitsPerEm)).join(" ")}] /ItalicAngle 0 /Ascent ${Math.round(f.ascent * 1000 / f.unitsPerEm)} /Descent ${Math.round(f.descent * 1000 / f.unitsPerEm)} /CapHeight 700 /StemV 80 /FontFile2 ${fileId} 0 R >>`);
  const cid = add(`<< /Type /Font /Subtype /CIDFontType2 /BaseFont /SoulFont /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${fd} 0 R /DW 1000 /W [${W}] /CIDToGIDMap /Identity >>`);
  objs[2] = Buffer.from(`<< /Type /Font /Subtype /Type0 /BaseFont /SoulFont /Encoding /Identity-H /DescendantFonts [${cid} 0 R] /ToUnicode ${toUniId} 0 R >>`, "latin1");
  objs[1] = Buffer.from(`<< /Type /Pages /Kids [${kidIds.map((k) => `${k} 0 R`).join(" ")}] /Count ${nPages} >>`, "latin1");
  void firstContent; void esc;

  const head = Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1");
  const chunks: Buffer[] = [head];
  const offsets: number[] = [];
  let pos = head.length;
  objs.forEach((o, i) => {
    const b = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, "latin1"), o, Buffer.from("\nendobj\n", "latin1")]);
    offsets.push(pos); chunks.push(b); pos += b.length;
  });
  const xref = [`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`, ...offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`)].join("");
  chunks.push(Buffer.from(`${xref}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`, "latin1"));
  return Buffer.concat(chunks);
}
