import { NextResponse } from "next/server";
import { isResp, requireUser } from "@/lib/api";
import { driveDownload, GoogleError } from "@/lib/google-api";
import { ONE_ROW_MAX } from "@/lib/upload-limits";

// One file the member just picked in Google's picker, streamed to their browser, which uploads it like any attachment
// (so card masking, size limits and text extraction stay in one place — app/api/files).
export async function GET(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[\w-]{10,200}$/.test(id)) return NextResponse.json({ error: "bad_id" }, { status: 400 });
  try {
    const f = await driveDownload(u.id, id);
    // Drive files stay at 50 MB: the whole file streams through this one function on its way to the browser
    if (f.size > ONE_ROW_MAX) { await f.body.cancel().catch(() => null); return NextResponse.json({ error: "too_big" }, { status: 413 }); }
    return new Response(f.body, { headers: { "Content-Type": f.mime, "X-File-Name": encodeURIComponent(f.name), "Cache-Control": "no-store" } });
  } catch (e) {
    const why = e instanceof GoogleError ? e.why : "failed";
    return NextResponse.json({ error: why }, { status: e instanceof GoogleError && e.status === 404 ? 404 : 502 });
  }
}
