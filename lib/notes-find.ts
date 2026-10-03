/** «My notes» search (ported from AI Soul «📚 Wiki» quick view 13f2261): every word must appear in the title, tags or text. */
export function findNotes<T extends { title: string; body: string; tags: string[] }>(rows: T[], q: string): T[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return rows;
  return rows.filter((n) => { const hay = `${n.title}\n${n.tags.join(" ")}\n${n.body}`.toLowerCase(); return words.every((w) => hay.includes(w)); });
}
