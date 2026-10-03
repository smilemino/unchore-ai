import { q } from "@/lib/db";

// Settings «My files» (AI Soul Settings.tsx «첨부 파일»): what the member attached and what the AI made, newest first,
// found by name — each with the chat it belongs to. Names only; the contents stay locked.
export type FileRow = { id: string; name: string; mime: string | null; size: number; made: boolean; conversation_id: string | null; created_at: string };

/** «%» and «_» typed in the search box are letters, not wildcards. */
export const likeText = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Search words: split on spaces, up to 6, no repeats (AI Soul — shop help card search «word by word», 10/2). */
export const findWords = (find: string) => [...new Set(find.trim().slice(0, 100).split(/\s+/).filter(Boolean))].slice(0, 6);

// Every word must be in the name, in any order, spaces in the name ignored — «list stock» finds «stock list.xlsx»,
// «stock list» finds «stocklist.xlsx». Before, the whole box had to appear as typed.
export async function listFiles(userId: string, find: string): Promise<FileRow[]> {
  const words = findWords(find);
  const match = words.map((_, i) => `and replace(name, ' ', '') ilike '%' || $${i + 2} || '%'`).join(" ");
  return q<FileRow>(
    `select id, name, mime, size, made, conversation_id, created_at from files where user_id = $1 ${match} order by created_at desc limit 200`,
    [userId, ...words.map(likeText)]);
}
