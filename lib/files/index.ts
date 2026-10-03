// Turns ```unchore-file``` blocks in an answer into real files (xlsx/docx/pptx/pdf) — dependency-free builders ported from AI Soul.
import { parseAnswer } from "./parse";
import { buildXlsx } from "./xlsx";
import { buildDocx } from "./docx";
import { buildPptx } from "./pptx";
import { buildPdf } from "./pdf";
import { DEFAULT_LOCALE, MIME, type FileLocale, type FileSpec } from "./types";
import { resolveFontPath } from "./pdf";

export function buildFile(spec: FileSpec, loc: FileLocale = DEFAULT_LOCALE): Buffer {
  switch (spec.format) {
    case "xlsx": return buildXlsx(spec, loc);
    case "docx": return buildDocx(spec, loc);
    case "pptx": return buildPptx(spec, loc);
    case "pdf": return buildPdf(spec, resolveFontPath(), loc);
  }
}

export type Built = { name: string; mime: string; data: Buffer };

/** Pulls the blocks out, builds each file, and returns the answer with each block replaced by «📎 name». Never throws. */
export function makeFiles(answer: string, loc: FileLocale = DEFAULT_LOCALE): { text: string; files: Built[]; failed: string[] } {
  const p = parseAnswer(answer);
  const files: Built[] = [];
  const failed = [...p.bad];
  for (const spec of p.specs) {
    const name = /\.[a-z]{3,4}$/i.test(spec.name) ? spec.name : `${spec.name}.${spec.format}`;
    try { files.push({ name, mime: MIME[spec.format], data: buildFile(spec, loc) }); }
    catch (e) { failed.push(`${name}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  return { text: p.text, files, failed };
}

export const FILES_GUIDE = [
  "## Making files",
  "When the user asks for a spreadsheet, Word document, PDF or slides, put one fenced block per file in your answer. The app turns it into a real file with a download chip; the raw block is never shown.",
  "Open the fence with ```unchore-file and put exactly one JSON object inside. Keep one or two lines of normal text outside the block. Numbers as plain digits (1250000).",
  'Excel: {"format":"xlsx","name":"Sales.xlsx","sheets":[{"name":"Sep","rows":[["Item","Amount"],["Online",12500000]]}]}',
  'Word or PDF: {"format":"docx","name":"Notice.docx","paragraphs":[{"text":"Holiday notice","style":"title"},{"text":"We are closed on Friday.","style":"body"}]} (style = title | heading | body; use "format":"pdf" for PDF)',
  'Slides: {"format":"pptx","name":"Intro.pptx","slides":[{"title":"Who we are","bullets":["Since 2015","12k members"]}]}',
  "If details are missing, make a sensible first draft anyway, then ask one short question. Never say you made a file unless the block is in the answer.",
].join("\n");
