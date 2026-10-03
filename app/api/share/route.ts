// «Send to a friend» (plan v11 §13 A): a link with the member's share code and the recipe — never their own settings.
import { NextResponse } from "next/server";
import { z } from "zod";
import { isResp, requireUser } from "@/lib/api";
import { one } from "@/lib/db";
import { myRefCode, shareUrl } from "@/lib/growth-source";
import { recordEvent } from "@/lib/privacy";
import { RECIPE_TITLES } from "@/lib/recipe-titles";

const Body = z.object({ automationId: z.string().uuid() });

export async function POST(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const a = await one<{ recipe: string }>("select recipe from automations where id = $1 and user_id = $2 and coalesce(args->>'kind', '') <> 'nudge'", [b.data.automationId, u.id]);
  if (!a || !RECIPE_TITLES[a.recipe]) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const url = shareUrl(await myRefCode(u.id), a.recipe);
  await recordEvent(u.id, "share_link").catch(() => {});
  return NextResponse.json({ url, recipe: a.recipe });
}
