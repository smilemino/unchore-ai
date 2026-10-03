import { NextResponse } from "next/server";
import { isResp, requireUser } from "@/lib/api";
import { MAX_WAV, addUsage, allowance, hear, wavSeconds } from "@/lib/voice/google";

export const maxDuration = 30;

// The first words of a voice chat, recorded as a short WAV (16 kHz mono): what was said and in which language.
// Used so nobody has to pick a language — Unchore answers and speaks in the language they started in.
export async function POST(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const wav = new Uint8Array(await req.arrayBuffer().catch(() => new ArrayBuffer(0)));
  if (wav.length < 1000 || wav.length > MAX_WAV || String.fromCharCode(...wav.slice(0, 4)) !== "RIFF") return NextResponse.json({ error: "bad_input" }, { status: 400 });
  const a = await allowance(u.id, u.tz);
  if (!a.ok || a.hearLeft <= 0) return NextResponse.json({ error: a.ok ? "daily_limit" : a.why }, { status: a.why === "off" ? 503 : 429 });
  const heard = await hear(wav, req.signal);
  await addUsage(u.id, u.tz, { hear: wavSeconds(wav.length) }).catch(() => {});
  if (!heard) return NextResponse.json({ error: "google_failed" }, { status: 502 });
  return NextResponse.json(heard);
}
