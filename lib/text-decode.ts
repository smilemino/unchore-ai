// Text attachment bytes → text. If it is not UTF-8, read it again as legacy Korean (EUC-KR/CP949 — CSVs saved by Excel, old Notepad files),
// otherwise the user only sees broken characters (�) with no idea why. Ported from AI Soul lib/text-decode.ts (2026-09-30 sync).
// stream: a cut in the middle of a character at the end must not count as «not UTF-8».
export function decodeText(buf: Uint8Array): string {
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder("utf-16le").decode(buf, { stream: true });   // Notepad «Unicode»
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder("utf-16be").decode(buf, { stream: true });
  for (const enc of ["utf-8", "euc-kr"]) {
    try { return new TextDecoder(enc, { fatal: true }).decode(buf, { stream: true }); } catch { /* not this encoding — next */ }
  }
  return new TextDecoder().decode(buf);   // neither: as before (only the broken spots become �)
}
