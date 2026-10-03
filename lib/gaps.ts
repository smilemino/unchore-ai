// «Can't do it» answers become work, not dead ends (2026-10-02 owner: «Unchore must make what doesn't work work right away —
// like AI Soul — not say it can't: yesterday pictures and Excel attachments, today video»).
// An answer that says it can't (lib/words cant_do) gets one look from a small model on Unchore's account: is this a missing
// ability of the app (a tool, file type, feature or connection) rather than something unsafe, unlawful or truly impossible?
// If so, one row in ability_gaps (030) with a short English name of the ability — never the member's words — and a note under
// the answer. AI Soul's 30-minute check (reminder-gates/unchore-gaps) builds it; /api/cron/gap tells the member in that chat.
import { tr } from "./i18n-server";
import type { Lang } from "./i18n";
import { houseKey } from "./credits";
import { one, q } from "./db";
import { scrub } from "./privacy";
import { wordsRe } from "./words";
import W_CANT from "./words/cant_do.json";
import SRC from "./words/src.json";

export const GAP_MODEL = "anthropic/claude-haiku-4.5";
// English and Korean are the examples in lib/words/src.json; every other language comes from lib/words/cant_do.json.
const CANT = wordsRe({ ...W_CANT, en: SRC.cant_do.en, ko: SRC.cant_do.ko });

/** Cheap first look: does the answer's opening say it can't? Long answers that do the work and mention a limit in passing don't count. */
export function looksCant(answer: string): boolean {
  const head = answer.slice(0, 1500);
  return answer.length < 8000 && CANT.test(head);
}

const SYSTEM = [
  "You read one exchange between a user and Unchore, a personal AI app. Decide whether the AI did NOT do what was asked because the APP lacks an ability:",
  "a tool, file type, feature, data source or connection that a software team could add (e.g. making or editing video, reading a file type, sending to a service, generating images).",
  "Not a gap: the AI did the task; it only needed more details from the user; the request is harmful, unlawful, deceptive or adult; it needs the user's own sign-in or approval; it's impossible for any software (predicting lottery numbers).",
  'Output JSON only: {"gap":true,"ability":"<what the app should be able to do, in English, 3–12 words, general — no names, numbers, places, companies or other personal details>"} or {"gap":false}.',
].join("\n");

type Call = (system: string, user: string) => Promise<string>;
async function houseCall(system: string, user: string): Promise<string> {
  const key = houseKey();
  if (!key) throw new Error("no house key");
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST", signal: AbortSignal.timeout(15_000),
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json", "HTTP-Referer": "https://unchore.ai", "X-Title": "Unchore" },
    body: JSON.stringify({ model: GAP_MODEL, max_tokens: 120, messages: [{ role: "system", content: system }, { role: "user", content: user }], provider: { data_collection: "deny" } }),
  });
  if (!res.ok) throw new Error(`house ${res.status}`);
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return j.choices?.[0]?.message?.content ?? "";
}

export function readGap(raw: string): string | null {
  try {
    const j = JSON.parse(raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").match(/\{[\s\S]*\}/)?.[0] ?? raw) as { gap?: unknown; ability?: unknown };
    const a = typeof j.ability === "string" ? scrub(j.ability).replace(/\s+/g, " ").trim().slice(0, 120) : "";
    return j.gap === true && a.length >= 3 ? a : null;
  } catch { return null; }
}

/** After an answer: a missing ability is recorded once per chat and day, and the note to show under the answer comes back. Never throws. */
export async function catchGap(o: { userId: string; convId: string; question: string; answer: string; lang: Lang; model: string | null }, call: Call = houseCall): Promise<string | null> {
  try {
    if (!looksCant(o.answer)) return null;
    const cut = (s: string, n: number) => scrub(s.replace(/\s+/g, " ").trim()).slice(0, n);
    const ability = readGap(await call(SYSTEM, `User asked: ${cut(o.question, 600)}\nAI answered: ${cut(o.answer, 1500)}`));
    if (!ability) return null;
    const same = await one<{ id: string }>("select id from ability_gaps where user_id = $1 and conversation_id = $2 and created_at > now() - interval '1 day' limit 1", [o.userId, o.convId]);
    if (!same) await q("insert into ability_gaps(user_id, conversation_id, ability, lang, model) values ($1, $2, $3, $4, $5)", [o.userId, o.convId, ability, o.lang, o.model]);
    return tr(o.lang, "📮 Unchore can't do this yet, so it was sent to be added. You'll get a message in this chat when it works.");
  } catch { return null; }
}

/** What the member reads in that chat once the ability is in. */
export function builtMessage(lang: Lang): string {
  return tr(lang, "✅ Update: Unchore can now do what you asked here. Ask again in this chat and it will be done.");
}
