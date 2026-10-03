import { NextResponse } from "next/server";
import { z } from "zod";
import { isResp, requireUser } from "@/lib/api";
import { one } from "@/lib/db";
import { autoModel, canWebSearch, chooseModel, providerOf, userKeys } from "@/lib/ai";
import { subWarm } from "@/lib/claude-sub";
import { computerFor } from "@/lib/tools/computer";
import { turnToolDefs } from "@/lib/turn";

// The chat box sends this when the member starts typing or turns voice mode on (components/Chat.tsx): if they answer with their
// own Claude or ChatGPT plan, the worker starts that program now, so the first words come about a second sooner (worker/warm.mjs).
// It works out the same model, web search and tools the turn will (lib/turn.ts); if the turn ends up different it is just not used.
const Body = z.object({ conversationId: z.string().uuid().nullable().optional(), projectId: z.string().uuid().nullable().optional(),
  model: z.string().max(80).nullable().optional(), voice: z.boolean().optional() });

export async function POST(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const b = Body.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  if (!process.env.BROWSER_WORKER_URL || process.env.UC_PREWARM === "0") return NextResponse.json({ ok: true, state: "off" });
  const d = b.data;
  const conv = d.conversationId ? await one<{ model: string | null; project_id: string | null }>("select model, project_id from conversations where id = $1 and user_id = $2", [d.conversationId, u.id]) : null;
  const projectId = conv?.project_id ?? d.projectId ?? null;
  const project = projectId ? await one<{ default_model: string | null }>("select default_model from projects where id = $1 and user_id = $2", [projectId, u.id]) : null;
  const keys = await userKeys(u.id);
  const wanted = d.model ?? conv?.model ?? project?.default_model ?? u.default_model;
  const model = wanted === "auto" ? autoModel(keys, "") : chooseModel(keys, wanted);
  const p = model ? providerOf(model) : null;
  if (p !== "claude_sub" && p !== "chatgpt_sub") return NextResponse.json({ ok: true, state: "not_plan" });
  const state = await subWarm({ userId: u.id, plan: p === "claude_sub" ? "claude" : "chatgpt", model: model!.slice(p === "claude_sub" ? 4 : 3),
    webSearch: Boolean(u.web_search) && canWebSearch(model!), tools: d.voice ? undefined : turnToolDefs(computerFor(u.email)) });
  return NextResponse.json({ ok: true, state });
}
