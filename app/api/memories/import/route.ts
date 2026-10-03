import { NextResponse } from "next/server";
import { logMemory } from "@/lib/memory-log";
import { z } from "zod";
import { isResp, requireUser } from "@/lib/api";
import { one, q } from "@/lib/db";
import { blocked } from "@/lib/memory";
import { splitMemoryPaste } from "@/lib/memory-import";
import { lock, unlock } from "@/lib/privacy";

// Add many memories from one paste (lib/memory-import.ts). Health, money, IDs and contact details are refused line by line like a
// single memory; a line already remembered word for word is skipped. Returns what was added, left out and refused.
const Body = z.object({ text: z.string().trim().min(2).max(20_000) });
export async function POST(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  const { items, skipped } = splitMemoryPaste(b.data.text);
  const have = new Set((await q<{ text: string }>("select text from memories where user_id = $1", [u.id])).map((r) => unlock(r.text).trim()));
  let added = 0, same = 0;
  const refused: string[] = [];
  for (const it of items.slice(0, 200)) {
    const text = it.content.slice(0, 300);
    if (text.length < 2) continue;
    if (blocked(text).length) { refused.push(text.slice(0, 40)); continue; }
    if (have.has(text)) { same++; continue; }
    const r = await one<{ id: string }>("insert into memories(user_id, text) values ($1, $2) returning id", [u.id, lock(text)]);
    await logMemory(u.id, "added", text, { memoryId: r?.id });
    have.add(text); added++;
  }
  return NextResponse.json({ added, same, skipped: skipped.length, refused });
}
