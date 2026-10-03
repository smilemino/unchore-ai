// 글꼴 파일(TrueType) 읽기와 «쓰는 글자만 남기기». PDF 에 한글을 넣으려면 글꼴을 파일 안에 함께 넣어야 한다.
// 쓰지 않는 글자의 그림만 비우고 글자 번호(gid)는 그대로 두므로, PDF 쪽 계산이 단순해진다.
import { readFileSync } from "node:fs";

export interface Font {
  data: Buffer;
  tables: Map<string, { off: number; len: number }>;
  unitsPerEm: number;
  numGlyphs: number;
  longLoca: boolean;
  loca: number[];
  widths: number[];              // 글자 너비(글꼴 단위)
  cmap: Map<number, number>;     // 유니코드 → 글자 번호
  bbox: [number, number, number, number];
  ascent: number;
  descent: number;
}

function tableDir(b: Buffer): Map<string, { off: number; len: number }> {
  const n = b.readUInt16BE(4);
  const m = new Map<string, { off: number; len: number }>();
  for (let i = 0; i < n; i++) { const o = 12 + 16 * i; m.set(b.toString("latin1", o, o + 4), { off: b.readUInt32BE(o + 8), len: b.readUInt32BE(o + 12) }); }
  return m;
}

function readCmap(b: Buffer, off: number): Map<number, number> {
  const out = new Map<number, number>();
  const n = b.readUInt16BE(off + 2);
  let best = -1; let bestScore = -1;
  for (let i = 0; i < n; i++) {
    const p = off + 4 + 8 * i;
    const plat = b.readUInt16BE(p), enc = b.readUInt16BE(p + 2), sub = off + b.readUInt32BE(p + 4);
    const score = plat === 3 && enc === 10 ? 3 : plat === 3 && enc === 1 ? 2 : plat === 0 ? 1 : 0;
    if (score > bestScore) { bestScore = score; best = sub; }
  }
  if (best < 0) return out;
  const fmt = b.readUInt16BE(best);
  if (fmt === 4) {
    const segX2 = b.readUInt16BE(best + 6);
    const ends = best + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
    for (let s = 0; s < segX2 / 2; s++) {
      const end = b.readUInt16BE(ends + s * 2), start = b.readUInt16BE(starts + s * 2);
      const delta = b.readInt16BE(deltas + s * 2), ro = b.readUInt16BE(ranges + s * 2);
      if (start === 0xffff) continue;
      for (let c = start; c <= end && c !== 0x10000; c++) {
        let g: number;
        if (ro === 0) g = (c + delta) & 0xffff;
        else { const gi = ranges + s * 2 + ro + (c - start) * 2; if (gi + 1 >= b.length) continue; g = b.readUInt16BE(gi); if (g) g = (g + delta) & 0xffff; }
        if (g) out.set(c, g);
      }
    }
  } else if (fmt === 12) {
    const groups = b.readUInt32BE(best + 12);
    for (let i = 0; i < groups; i++) {
      const p = best + 16 + 12 * i;
      const s = b.readUInt32BE(p), e = b.readUInt32BE(p + 4), g = b.readUInt32BE(p + 8);
      for (let c = s; c <= e && c - s < 0x10000; c++) out.set(c, g + (c - s));
    }
  }
  return out;
}

export function loadFont(path: string): Font {
  const data = readFileSync(path);
  const tables = tableDir(data);
  const get = (t: string) => { const x = tables.get(t); if (!x) throw new Error(`글꼴에 ${t} 표가 없습니다: ${path}`); return x; };
  const head = get("head").off, maxp = get("maxp").off, hhea = get("hhea").off;
  const unitsPerEm = data.readUInt16BE(head + 18);
  const longLoca = data.readInt16BE(head + 50) === 1;
  const numGlyphs = data.readUInt16BE(maxp + 4);
  const numH = data.readUInt16BE(hhea + 34);
  const hmtx = get("hmtx").off;
  const widths: number[] = [];
  let last = 0;
  for (let i = 0; i < numGlyphs; i++) { if (i < numH) last = data.readUInt16BE(hmtx + i * 4); widths.push(last); }
  const locaT = get("loca");
  const loca: number[] = [];
  for (let i = 0; i <= numGlyphs; i++) loca.push(longLoca ? data.readUInt32BE(locaT.off + i * 4) : data.readUInt16BE(locaT.off + i * 2) * 2);
  return {
    data, tables, unitsPerEm, numGlyphs, longLoca, loca, widths,
    cmap: readCmap(data, get("cmap").off),
    bbox: [data.readInt16BE(head + 36), data.readInt16BE(head + 38), data.readInt16BE(head + 40), data.readInt16BE(head + 42)],
    ascent: data.readInt16BE(hhea + 4), descent: data.readInt16BE(hhea + 6),
  };
}

/** 겹글자(다른 글자를 조합해 만든 글자)가 부르는 글자까지 함께 챙긴다 */
function withComponents(f: Font, gids: Set<number>): Set<number> {
  const glyf = f.tables.get("glyf")!.off;
  const todo = [...gids];
  while (todo.length) {
    const g = todo.pop()!;
    const s = f.loca[g] ?? 0, e = f.loca[g + 1] ?? 0;
    if (e - s < 10 || f.data.readInt16BE(glyf + s) >= 0) continue;
    let p = glyf + s + 10;
    for (;;) {
      const flags = f.data.readUInt16BE(p), idx = f.data.readUInt16BE(p + 2);
      if (!gids.has(idx)) { gids.add(idx); todo.push(idx); }
      p += 4 + (flags & 1 ? 4 : 2) + (flags & 8 ? 2 : flags & 0x40 ? 4 : flags & 0x80 ? 8 : 0);
      if (!(flags & 0x20)) break;
    }
  }
  return gids;
}

const KEEP = ["cvt ", "fpgm", "prep", "head", "hhea", "hmtx", "maxp"];

/** 쓰는 글자만 남긴 글꼴 파일을 만든다(글자 번호는 그대로). */
export function subsetFont(f: Font, used: Set<number>): Buffer {
  const gids = withComponents(f, new Set([0, ...used]));
  const glyfOff = f.tables.get("glyf")!.off;
  const parts: Buffer[] = [];
  const newLoca: number[] = [];
  let pos = 0;
  for (let g = 0; g < f.numGlyphs; g++) {
    newLoca.push(pos);
    if (!gids.has(g)) continue;
    const s = f.loca[g] ?? 0, e = f.loca[g + 1] ?? 0;
    if (e <= s) continue;
    let chunk = f.data.subarray(glyfOff + s, glyfOff + e);
    if (chunk.length % 4) chunk = Buffer.concat([chunk, Buffer.alloc(4 - (chunk.length % 4))]);
    parts.push(chunk); pos += chunk.length;
  }
  newLoca.push(pos);
  const glyf = Buffer.concat(parts);
  const loca = Buffer.alloc(4 * newLoca.length);
  newLoca.forEach((v, i) => loca.writeUInt32BE(v, i * 4));
  const out = new Map<string, Buffer>();
  for (const t of KEEP) { const x = f.tables.get(t); if (x) out.set(t, Buffer.from(f.data.subarray(x.off, x.off + x.len))); }
  const head = Buffer.from(out.get("head")!); head.writeInt16BE(1, 50); head.writeUInt32BE(0, 8);   // 자리표가 긴 꼴이라고 적는다
  out.set("head", head);
  out.set("loca", loca); out.set("glyf", glyf);
  return buildSfnt(out);
}

function buildSfnt(tables: Map<string, Buffer>): Buffer {
  const names = [...tables.keys()].sort();
  const n = names.length;
  const search = Math.floor(Math.log2(n)) ;
  const head = Buffer.alloc(12 + 16 * n);
  head.writeUInt32BE(0x00010000, 0); head.writeUInt16BE(n, 4);
  head.writeUInt16BE(16 * 2 ** search, 6); head.writeUInt16BE(search, 8); head.writeUInt16BE(16 * n - 16 * 2 ** search, 10);
  const body: Buffer[] = [];
  let off = head.length;
  names.forEach((name, i) => {
    let data = tables.get(name)!;
    if (data.length % 4) data = Buffer.concat([data, Buffer.alloc(4 - (data.length % 4))]);
    const p = 12 + 16 * i;
    head.write(name, p, 4, "latin1");
    head.writeUInt32BE(0, p + 4);                    // 검사합은 0 으로 둔다(읽는 쪽이 따지지 않는다)
    head.writeUInt32BE(off, p + 8);
    head.writeUInt32BE(tables.get(name)!.length, p + 12);
    body.push(data); off += data.length;
  });
  return Buffer.concat([head, ...body]);
}
