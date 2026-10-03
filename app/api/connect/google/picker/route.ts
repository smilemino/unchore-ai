import { NextResponse } from "next/server";
import { isResp, requireUser } from "@/lib/api";
import { accessToken, connection } from "@/lib/google-connect";
import { googleClientId } from "@/lib/google-env";

// Google's file picker (components/DrivePick.tsx) needs the member's own short-lived token and the Cloud project number.
// drive.file: Unchore can then open only the files they pick there.
export async function GET() {
  const u = await requireUser();
  if (isResp(u)) return u;
  const c = await connection(u.id);
  if (!c?.services.includes("drive")) return NextResponse.json({ error: "not_connected" }, { status: 409 });
  const token = await accessToken(u.id);
  if (!token) return NextResponse.json({ error: "not_connected" }, { status: 409 });
  return NextResponse.json({ token, appId: googleClientId().split("-")[0] }, { headers: { "Cache-Control": "no-store" } });
}
