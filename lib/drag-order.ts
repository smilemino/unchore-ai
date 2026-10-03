// Drag to reorder — the order math only, no screen (ported from AI Soul lib/drag-order.ts).

export function moveBefore(list: string[], id: string, before: string | null): string[] {
  if (!list.includes(id) || before === id) return list;
  const rest = list.filter((x) => x !== id);
  const at = before === null ? -1 : rest.indexOf(before);
  return at < 0 ? [...rest, id] : [...rest.slice(0, at), id, ...rest.slice(at)];
}

export function sortByOrder<T extends { id: string }>(rows: T[], order: string[]): T[] {
  const rank = new Map(order.map((id, i) => [id, i]));
  const known = rows.filter((r) => rank.has(r.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  return [...known, ...rows.filter((r) => !rank.has(r.id))];
}

export function dropTarget(rows: Array<{ id: string; top: number; height: number }>, y: number, id: string): string | null {
  let i = rows.findIndex((r) => y < r.top + r.height / 2);
  if (i < 0) i = rows.length;
  if (rows[i]?.id === id || rows[i - 1]?.id === id) return id;
  return rows[i]?.id ?? null;
}
