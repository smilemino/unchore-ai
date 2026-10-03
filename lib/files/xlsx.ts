// 엑셀(xlsx) 굽기 — 글자는 inlineStr 로 칸 안에 바로 넣는다(공용 글자표가 없어도 엑셀·리브레오피스·openpyxl 이 읽는다).
import { zip, xe, type ZipEntry } from "./zip";
import { DEFAULT_LOCALE, type FileLocale, type XlsxSpec } from "./types";

/** 0 → A, 25 → Z, 26 → AA */
export function colName(i: number): string {
  let n = i + 1, s = "";
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function sheetXml(rows: Array<Array<string | number | null>>): string {
  const body = rows.map((row, r) => {
    const cells = row.map((v, c) => {
      const ref = `${colName(c)}${r + 1}`;
      if (v === null || v === undefined || v === "") return "";
      if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xe(String(v))}</t></is></c>`;
    }).join("");
    return `<row r="${r + 1}">${cells}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

export function buildXlsx(spec: XlsxSpec, loc: FileLocale = DEFAULT_LOCALE): Buffer {
  const sheets = spec.sheets.length ? spec.sheets : [{ name: loc.lang === "ko" ? loc.sheet : `${loc.sheet}1`, rows: [] }];
  const entries: ZipEntry[] = [];
  const types = sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("");
  entries.push({ name: "[Content_Types].xml", data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${types}</Types>`, "utf8") });
  entries.push({ name: "_rels/.rels", data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`, "utf8") });
  const sheetTags = sheets.map((s, i) => `<sheet name="${xe((s.name ?? `${loc.sheet}${i + 1}`).slice(0, 31).replace(/[\\/?*[\]:]/g, " "))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("");
  entries.push({ name: "xl/workbook.xml", data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetTags}</sheets></workbook>`, "utf8") });
  const rels = sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("");
  entries.push({ name: "xl/_rels/workbook.xml.rels", data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`, "utf8") });
  sheets.forEach((s, i) => entries.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: Buffer.from(sheetXml(s.rows ?? []), "utf8") }));
  return zip(entries);
}
