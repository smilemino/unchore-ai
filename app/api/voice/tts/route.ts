import { NextResponse } from "next/server";
import { isResp, requireUser } from "@/lib/api";
import { asMember } from "@/lib/db";
import { isVoice } from "@/lib/voice/catalog";
import { MAX_TEXT, addUsage, allowance, chargeVoice, openTts, pcmStream } from "@/lib/voice/google";

export const maxDuration = 60;

// Reads one piece of an answer aloud with Google's voice: POST {text, voice} → audio/l16 (24 kHz, 16-bit, mono) as it arrives.
// Refuses with 429 once today's allowance or the member's credit is used up — the browser then reads with the phone's own voice.
export async function POST(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const b = (await req.json().catch(() => ({}))) as { text?: unknown; voice?: unknown };
  const text = typeof b.text === "string" ? b.text.trim() : "";
  if (!text || text.length > MAX_TEXT || !isVoice(b.voice)) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  // Google starts speaking while the allowance is checked (the first sound is what the user waits for); if the check says no,
  // Google's stream is cancelled before anything is played or metered.
  const ac = new AbortController();
  req.signal.addEventListener("abort", () => ac.abort());
  const [a, sse] = await Promise.all([allowance(u.id, u.tz), openTts(text, b.voice, ac.signal)]);
  const no = !a.ok ? a.why : a.speakLeft <= 0 ? "daily_limit" : !a.credit ? "no_credit" : null;
  if (no) { ac.abort(); void sse?.cancel().catch(() => {}); return NextResponse.json({ error: no }, { status: no === "off" ? 503 : 429 }); }
  if (!sse) return NextResponse.json({ error: "google_failed" }, { status: 502 });
  // Metered as the stream ends (or the listener stops it), fenced to this member like the rest of the route.
  const body = pcmStream(sse, async (bytes) => {
    await asMember(u.id, () => addUsage(u.id, u.tz, { speak: bytes / 48000 }));
    await chargeVoice(u.id, bytes / 48000);   // the welcome credit pays for it (owner 2026-10-01)
  });
  return new Response(body, { headers: { "Content-Type": "audio/l16; rate=24000; channels=1", "Cache-Control": "no-store", "X-Accel-Buffering": "no", "X-Voice-Left": String(Math.round(a.speakLeft)) } });
}
