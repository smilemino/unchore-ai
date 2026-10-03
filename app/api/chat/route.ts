import { NextResponse, after } from "next/server";
import { isResp, requireUser } from "@/lib/api";
import { one } from "@/lib/db";
import { tr } from "@/lib/i18n-server";
import { pushUser } from "@/lib/push";
import { TurnBody, TurnError, runTurn, type Meta } from "@/lib/turn";
import { isComputerModel } from "@/lib/computers";
import { keepGoing } from "@/lib/keep-going";

export const maxDuration = 800;   // an answer that works on the member's computer may run for up to 13 minutes (lib/tools/computer.ts)

// Streams the answer as plain text. Status lines are wrapped in \u0001…\u0001 and are not part of the answer.
// After the answer, one NUL byte then a JSON line (see Meta in lib/turn.ts).
// The answer is not tied to the open page (2026-10-01 owner): closing the window or going to another site doesn't stop it —
// it is finished and saved, and if no screen took it the member gets a notification. Only ■ Stop stops it (/api/chat/stop, by turn number).
export async function POST(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const b = TurnBody.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  const d = { ...b.data, reminder: false, auto: false };
  const enc = new TextEncoder();
  let first = true, gone = false;
  let out: ReadableStreamDefaultController<Uint8Array> | null = null;
  const put = (s: string) => { if (gone || !out) return; try { out.enqueue(enc.encode(s)); } catch { gone = true; } };
  req.signal.addEventListener("abort", () => { gone = true; }, { once: true });
  const stream = new ReadableStream<Uint8Array>({ start(c) { out = c; }, cancel() { gone = true; } });
  let kept: Promise<void> = Promise.resolve();   // «Is it really done?» turns after this answer (keepOn below)
  const job = runTurn(u, d, { signal: req.signal, send: (s) => { first = false; put(s); } })
    .then((meta): Meta | null => { put("\u0000" + JSON.stringify(meta)); return meta; },
      (e): null => { const code = e instanceof TurnError ? e.code : "error"; if (first) put(`\u0000${JSON.stringify({ error: code })}`); return null; })
    .then(async (meta) => {
      if (!gone) { try { out?.close(); } catch { /* client left */ } }
      if (meta?.messageId && !meta.stopped && !meta.failed && !meta.later) kept = keepOn(u, meta, !d.voice && !d.research);
      if (!meta?.messageId || meta.stopped || meta.quiet || !d.turn) return;
      // Nobody's screen took the answer within 5 s (POST /api/chat/got) → «your answer is ready». The server isn't told when the
      // browser leaves (measured on unchore.ai 2026-10-01), so the page's «got it» is the sign, not the page going away.
      for (let i = 0; i < 5; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const g = await one<{ got: boolean }>("select coalesce(c.got_at >= m.created_at, false) as got from conversations c, messages m where c.id = $1 and m.id = $2", [meta.conversationId, meta.messageId]).catch(() => null);
        if (g?.got) return;
      }
      const q = d.text.replace(/\s+/g, " ").trim();
      await pushUser(u.id, { title: "Unchore", body: tr(u.lang, "Your answer is ready: «{q}»", { q: q.length > 60 ? `${q.slice(0, 60)}…` : q }),
        url: `/app?c=${meta.conversationId}`, tag: `unchore-answer-${meta.conversationId}` }).catch((e) => { console.warn(`answer push failed: ${(e as Error).message}`); return 0; });
    });
  after(() => job.then(() => kept));   // keeps the server working after the page is gone
  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}

/** «Is it really done?» (lib/keep-going.ts): while the member's strong AI finds more the AI can do by itself, the chat gets one more
 *  turn — the open screen shows it like any answer being written. Each turn is checked again; keepGoing stops at its limit. */
async function keepOn(u: { id: string; lang: string; tz: string; default_model: string | null }, meta: Meta, tools: boolean): Promise<void> {
  let m: Meta | null = meta;
  while (m?.messageId && !m.stopped && !m.failed && !m.later) {
    const text = await keepGoing(u, { convId: m.conversationId, messageId: m.messageId, model: m.model, tools: tools && !isComputerModel(m.model) });
    if (!text) return;
    m = await runTurn(u, { conversationId: m.conversationId, text, auto: true }).catch((e) => { console.warn(`keep-going turn failed: ${(e as Error).message}`); return null; });
  }
}
