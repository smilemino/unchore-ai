import { asLang } from "../i18n";
import { tr } from "../i18n-server";
// File blocks the AI writes inside an answer; this module turns them into real files on the server.
// The AI gets no tools for this — it only writes the block, the server builds the file.
export type FileFormat = "xlsx" | "docx" | "pptx" | "pdf";

export interface XlsxSpec { format: "xlsx"; name: string; sheets: Array<{ name?: string; rows: Array<Array<string | number | null>> }> }
export interface DocxSpec { format: "docx"; name: string; paragraphs: Array<{ text: string; style?: "title" | "heading" | "body" }> }
export interface PdfSpec { format: "pdf"; name: string; paragraphs: Array<{ text: string; style?: "title" | "heading" | "body" }> }
export interface PptxSpec { format: "pptx"; name: string; slides: Array<{ title: string; bullets?: string[] }> }
export type FileSpec = XlsxSpec | DocxSpec | PptxSpec | PdfSpec;

/** Who the file is for: slide text language (any of the app's 58), a blank sheet's name in that language, and paper size (Letter in the US and nearby, A4 elsewhere). */
export interface FileLocale { lang: string; letter: boolean; sheet: string }
export const DEFAULT_LOCALE: FileLocale = { lang: "en", letter: false, sheet: "Sheet" };
// Letter-paper time zones: the US, Canada, Mexico, Central America and the Caribbean, Chile, Colombia, Venezuela, the Philippines.
const LETTER_TZ = /^(America\/(?!Sao_Paulo|Argentina|Montevideo|Asuncion|Bahia|Belem|Fortaleza|Recife|Maceio|Manaus|Cuiaba|Campo_Grande|Porto_Velho|Boa_Vista|Rio_Branco|Araguaina|Santarem|Noronha|La_Paz|Lima|Guayaquil|Cayenne|Paramaribo|Guyana)|US\/|Canada\/|Pacific\/Honolulu|Asia\/Manila)/;
export function fileLocale(lang: string, tz: string): FileLocale {
  const l = asLang(lang);
  return { lang: l, letter: LETTER_TZ.test(tz), sheet: tr(l, "Sheet#tab") };
}

export interface MadeFile { name: string; mime: string; format: FileFormat; path: string; size: number }

export const MIME: Record<FileFormat, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  pdf: "application/pdf",
};
