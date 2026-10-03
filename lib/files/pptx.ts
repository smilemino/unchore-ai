import { speechTag } from "../i18n";
// 파워포인트(pptx) 굽기 — 판 하나(제목+글머리표)로 장을 만든다. 기본 틀(마스터·레이아웃·색표)은 가장 작은 꼴로 직접 적는다.
import { zip, xe, type ZipEntry } from "./zip";
import { DEFAULT_LOCALE, type FileLocale, type PptxSpec } from "./types";

const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const CLRMAP = '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>';

function textShape(id: number, name: string, x: number, y: number, cx: number, cy: number, paras: string): string {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>` +
    `<p:txBody><a:bodyPr wrap="square"><a:normAutofit/></a:bodyPr><a:lstStyle/>${paras}</p:txBody></p:sp>`;
}

function slideXml(title: string, bullets: string[], lang: string): string {
  const t = `<a:p><a:pPr algn="l"/><a:r><a:rPr lang="${lang}" sz="3200" b="1" dirty="0"/><a:t>${xe(title)}</a:t></a:r></a:p>`;
  const b = (bullets.length ? bullets : [""]).map((s) => `<a:p><a:pPr marL="285750" indent="-285750"><a:buChar char="•"/></a:pPr><a:r><a:rPr lang="${lang}" sz="2000" dirty="0"/><a:t>${xe(s)}</a:t></a:r></a:p>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld ${NS}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>` +
    textShape(2, "Title", 838200, 365125, 10515600, 1325563, t) +
    textShape(3, "Body", 838200, 1825625, 10515600, 4351338, b) +
    `</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

const THEME = (() => {
  const colors = ["dk1|000000", "lt1|FFFFFF", "dk2|44546A", "lt2|E7E6E6", "accent1|4472C4", "accent2|ED7D31", "accent3|A5A5A5", "accent4|FFC000", "accent5|5B9BD5", "accent6|70AD47", "hlink|0563C1", "folHlink|954F72"]
    .map((c) => { const [k, v] = c.split("|"); const inner = `<a:srgbClr val="${v}"/>`; return k === "dk1" || k === "lt1" ? `<a:${k}><a:sysClr val="${k === "dk1" ? "windowText" : "window"}" lastClr="${v}"/></a:${k}>` : `<a:${k}>${inner}</a:${k}>`; }).join("");
  const font = (tag: string, name: string) => `<a:${tag}><a:latin typeface="${name}"/><a:ea typeface="맑은 고딕"/><a:cs typeface=""/></a:${tag}>`;
  const fill = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
  const line = '<a:ln w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Unchore"><a:themeElements><a:clrScheme name="Unchore">${colors}</a:clrScheme>` +
    `<a:fontScheme name="Unchore">${font("majorFont", "Arial")}${font("minorFont", "Arial")}</a:fontScheme>` +
    `<a:fmtScheme name="Unchore"><a:fillStyleLst>${fill}${fill}${fill}</a:fillStyleLst><a:lnStyleLst>${line}${line}${line}</a:lnStyleLst>` +
    `<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>` +
    `<a:bgFillStyleLst>${fill}${fill}${fill}</a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`;
})();

const EMPTY_TREE = '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree>';

export function buildPptx(spec: PptxSpec, loc: FileLocale = DEFAULT_LOCALE): Buffer {
  const lang = speechTag(loc.lang);   // «ja-JP», «ar-SA» … — the slide text's language for spelling and fonts
  const slides = (spec.slides ?? []).length ? spec.slides : [{ title: "Blank", bullets: [] }];
  const e: ZipEntry[] = [];
  const put = (name: string, xml: string) => e.push({ name, data: Buffer.from(xml, "utf8") });
  const slideTypes = slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("");
  put("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${slideTypes}</Types>`);
  put("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="ppt/presentation.xml"/></Relationships>`);
  const sldIds = slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join("");
  put("ppt/presentation.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation ${NS}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${sldIds}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`);
  const presRels = slides.map((_, i) => `<Relationship Id="rId${i + 2}" Type="${REL}/slide" Target="slides/slide${i + 1}.xml"/>`).join("");
  put("ppt/_rels/presentation.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/slideMaster" Target="slideMasters/slideMaster1.xml"/>${presRels}<Relationship Id="rId${slides.length + 2}" Type="${REL}/theme" Target="theme/theme1.xml"/></Relationships>`);
  put("ppt/slideMasters/slideMaster1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster ${NS}><p:cSld>${EMPTY_TREE}</p:cSld>${CLRMAP}<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`);
  put("ppt/slideMasters/_rels/slideMaster1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="${REL}/theme" Target="../theme/theme1.xml"/></Relationships>`);
  put("ppt/slideLayouts/slideLayout1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout ${NS} type="blank" preserve="1"><p:cSld name="Blank">${EMPTY_TREE}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`);
  put("ppt/slideLayouts/_rels/slideLayout1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`);
  put("ppt/theme/theme1.xml", THEME);
  slides.forEach((s, i) => {
    put(`ppt/slides/slide${i + 1}.xml`, slideXml(s.title ?? "", (s.bullets ?? []).map(String), lang));
    put(`ppt/slides/_rels/slide${i + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`);
  });
  return zip(e);
}
