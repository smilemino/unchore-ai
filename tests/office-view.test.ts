// Excel · Word · PowerPoint preview (app/view/[id], lib/office-view.ts): the tables and words come out, chat links open the preview,
// and only the member's own file is read. DB part skipped without TEST_DATABASE_URL; CI starts one.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { strToU8, zipSync } from "fflate";
import pg from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import { fileOpenHref, officeKind } from "@/lib/office-kind";
import { docxParagraphs, docxText, pptxSlides, pptxText, xlsxSheets, xlsxText } from "@/lib/office-text";

const zip = (files: Record<string, string>) => zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));
const XLSX = zip({
  "xl/workbook.xml": `<workbook><sheets><sheet name="재고 &amp; 값" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`,
  "xl/sharedStrings.xml": `<sst><si><t>상품</t></si><si><t>&lt;script&gt;x</t></si></sst>`,
  "xl/worksheets/sheet1.xml": `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1"><v>12</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c></row></sheetData></worksheet>`,
});
const DOCX = zip({ "word/document.xml": `<w:document><w:body><w:p><w:r><w:t>첫 </w:t></w:r><w:r><w:t>문단</w:t></w:r></w:p><w:p></w:p><w:p><w:r><w:t>둘째</w:t></w:r></w:p></w:body></w:document>` });
const PPTX = zip({
  "ppt/presentation.xml": `<p:presentation><p:sldIdLst><p:sldId id="1" r:id="rId2"/><p:sldId id="2" r:id="rId1"/></p:sldIdLst></p:presentation>`,
  "ppt/_rels/presentation.xml.rels": `<Relationships><Relationship Id="rId1" Target="slides/slide1.xml"/><Relationship Id="rId2" Target="slides/slide2.xml"/></Relationships>`,
  "ppt/slides/slide1.xml": `<p:sld><a:p><a:r><a:t>뒤 장</a:t></a:r></a:p></p:sld>`,
  "ppt/slides/slide2.xml": `<p:sld><a:p><a:r><a:t>제목</a:t></a:r></a:p><a:p><a:r><a:t>본문</a:t></a:r></a:p></p:sld>`,
});

describe("office preview parsing", () => {
  it("xlsx: sheets with rows of cells, gaps kept as empty cells, markup left as text", () => {
    expect(xlsxSheets(XLSX)).toEqual([{ name: "재고 & 값", rows: [["상품", "", "12"], ["<script>x"]], cut: false }]);
    expect(xlsxText(XLSX)).toBe("## 재고 & 값\n상품\t\t12\n<script>x");   // text for the AI unchanged
  });
  it("docx: non-empty paragraphs in order", () => {
    expect(docxParagraphs(DOCX)).toEqual(["첫 문단", "둘째"]);
    expect(docxText(DOCX)).toBe("첫 문단\n둘째");
  });
  it("pptx: slides in the presentation's order", () => {
    expect(pptxSlides(PPTX)).toEqual([["제목", "본문"], ["뒤 장"]]);
    expect(pptxText(PPTX)).toBe("## Slide 1\n제목\n본문\n\n## Slide 2\n뒤 장");
  });
});

describe("where a chat file opens", () => {
  it("Office files open the preview page; others open the file itself", () => {
    expect(officeKind("application/octet-stream", "표.XLSX")).toBe("xlsx");
    expect(fileOpenHref({ id: "a", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", name: "x" })).toBe("/view/a");
    expect(fileOpenHref({ id: "a", mime: "application/pdf", name: "x.pdf" })).toBe("/api/files/a?view=1");
  });
});

const URL = process.env.TEST_DATABASE_URL;
describe.skipIf(!URL)("office preview (database)", () => {
  let ov: typeof import("@/lib/office-view");
  let uid = "", other = "", mine = "", theirs = "", pdf = "", big = "";
  beforeAll(async () => {
    const name = `uc_oview_${randomUUID().slice(0, 8)}`;
    const admin = new pg.Client({ connectionString: URL }); await admin.connect();
    await admin.query(`create database ${name}`);
    for (let i = 0; i < 20 && !(await admin.query("select 1 from pg_roles where rolname = 'unchore_member'")).rowCount; i++) await new Promise((r) => setTimeout(r, 250));
    await admin.query("do $$ begin create role unchore_member nologin; exception when duplicate_object or unique_violation then null; end $$");
    await admin.end();
    const url = new globalThis.URL(URL!); url.pathname = `/${name}`;
    process.env.DATABASE_URL = url.toString();
    execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: "pipe" });
    const db = await import("@/lib/db");
    const { lockBytes } = await import("@/lib/privacy");
    ov = await import("@/lib/office-view");
    uid = (await db.one<{ id: string }>("insert into users(email) values ($1) returning id", [`o-${randomUUID()}@t.test`]))!.id;
    other = (await db.one<{ id: string }>("insert into users(email) values ($1) returning id", [`p-${randomUUID()}@t.test`]))!.id;
    const add = async (u: string, n: string, mime: string, data: Buffer, size = data.length) => (await db.one<{ id: string }>("insert into files(user_id, name, mime, size, data) values ($1,$2,$3,$4,$5) returning id", [u, n, mime, size, data]))!.id;
    mine = await add(uid, "재고.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", lockBytes(Buffer.from(XLSX)));
    theirs = await add(other, "남의.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", lockBytes(Buffer.from(DOCX)));
    pdf = await add(uid, "a.pdf", "application/pdf", Buffer.from("%PDF"));
    big = await add(uid, "큰.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation", Buffer.from("x"), ov.PREVIEW_MAX + 1);
  }, 30_000);

  it("reads the member's own Office file", async () => {
    const p = await ov.loadPreview(uid, mine);
    expect(p).toMatchObject({ kind: "xlsx", name: "재고.xlsx" });
    expect(p && p.kind === "xlsx" && p.sheets[0]!.rows[0]).toEqual(["상품", "", "12"]);
  });
  it("someone else's file, a missing id or a bad id → not found", async () => {
    expect(await ov.loadPreview(uid, theirs)).toBeNull();
    expect(await ov.loadPreview(uid, randomUUID())).toBeNull();
    expect(await ov.loadPreview(uid, "../x")).toBeNull();
  });
  it("not Office / too big / broken → a message with the download link, not a crash", async () => {
    expect(await ov.loadPreview(uid, pdf)).toMatchObject({ kind: "none" });
    expect(await ov.loadPreview(uid, big)).toMatchObject({ kind: "too_big" });
    const db = await import("@/lib/db");
    const broken = (await db.one<{ id: string }>("insert into files(user_id, name, mime, size, data) values ($1,'깨짐.docx','application/octet-stream',3,'abc') returning id", [uid]))!.id;
    expect(await ov.loadPreview(uid, broken)).toMatchObject({ kind: "broken" });
  });
});
