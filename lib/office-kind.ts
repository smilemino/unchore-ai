// Which Office file this is, from its type or name — its own file so the chat screen can ask without pulling the zip reader in.
export type OfficeKind = "xlsx" | "docx" | "pptx";
export function officeKind(mime: string, name: string): OfficeKind | null {
  if (/spreadsheetml\.sheet$/.test(mime) || /\.xlsx$/i.test(name)) return "xlsx";
  if (/wordprocessingml\.document$/.test(mime) || /\.docx$/i.test(name)) return "docx";
  if (/presentationml\.presentation$/.test(mime) || /\.pptx$/i.test(name)) return "pptx";
  return null;
}
/** Where a chat file opens: Excel · Word · PowerPoint in the preview page, everything else as the file itself. */
export const fileOpenHref = (f: { id: string; mime: string; name: string }) => officeKind(f.mime, f.name) ? `/view/${f.id}` : `/api/files/${f.id}?view=1`;
