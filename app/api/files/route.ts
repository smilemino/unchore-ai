import { extractText } from "@/lib/extract";
import { maskCardsInFile } from "@/lib/card-mask";
import { NextResponse } from "next/server";
import { isResp, requireUser } from "@/lib/api";
import { one } from "@/lib/db";
import { listFiles } from "@/lib/files-list";
import { MAX_PER_CHAT, MAX_UPLOAD } from "@/lib/uploads";
import { lockBytes, lockOrNull, markGoogleChat } from "@/lib/privacy";

// Upload one file (multipart field «file», optional «conversationId»). Returns {id, name, mime, size}.
export async function POST(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const form = await req.formData().catch(() => null);
  const f = form?.get("file");
  if (!(f instanceof File)) return NextResponse.json({ error: "no_file" }, { status: 400 });
  if (f.size > MAX_UPLOAD) return NextResponse.json({ error: "too_big", max: MAX_UPLOAD }, { status: 413 });
  const conv = String(form?.get("conversationId") ?? "") || null;
  if (conv) {
    const c = await one<{ n: number }>("select (select count(*)::int from files where conversation_id = c.id) as n from conversations c where c.id = $1 and c.user_id = $2", [conv, u.id]);
    if (!c) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (c.n >= MAX_PER_CHAT) return NextResponse.json({ error: "too_many", max: MAX_PER_CHAT }, { status: 400 });
  }
  const buf = maskCardsInFile(Buffer.from(await f.arrayBuffer())).data;   // card numbers masked on arrival (lib/card-mask.ts)
  const mime = f.type || "application/octet-stream";
  const text = await extractText(f.name, mime, buf);   // text · PDF · Excel/Word/PowerPoint (lib/extract.ts)
  const google = form?.get("source") === "google";   // picked from Google Drive (components/DrivePick.tsx) — the chat is kept out of improvement copies
  const row = await one<{ id: string }>("insert into files(user_id, conversation_id, name, mime, size, data, text_extract, from_google) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id",
    [u.id, conv, f.name.slice(0, 200), mime, buf.length, lockBytes(buf), lockOrNull(text), google]);
  if (google && conv) await markGoogleChat(conv);
  return NextResponse.json({ id: row!.id, name: f.name, mime, size: buf.length });
}

// The member's files, newest first (Settings «My files» — lib/files-list.ts).
export async function GET(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  return NextResponse.json(await listFiles(u.id, new URL(req.url).searchParams.get("q") ?? ""));
}
