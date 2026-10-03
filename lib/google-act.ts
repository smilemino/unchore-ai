import { z } from "zod";

// «Yes» cards for Google actions (lib/google-lookup.ts GOOGLE_GUIDE): the answer carries <<<google {json}>>> lines; the screen shows
// each as a card; /api/connect/google/act runs one only after the member presses «Yes», once (google_actions).
export const GoogleAction = z.discriminatedUnion("do", [
  z.object({ do: z.literal("calendar.add"), title: z.string().min(1).max(300), start: z.string().min(10).max(40), end: z.string().min(10).max(40).optional(), where: z.string().max(300).optional(), note: z.string().max(4000).optional() }),
  z.object({ do: z.literal("gmail.send"), to: z.string().email().max(200), subject: z.string().max(300), body: z.string().min(1).max(20_000) }),
]);
export type GoogleActionT = z.infer<typeof GoogleAction>;

const MARK = /<<<google (\{[^\n]*\})>>>/g;
/** The proposals in an answer, in order; broken ones are skipped. */
export function readGoogleActions(text: string): GoogleActionT[] {
  const out: GoogleActionT[] = [];
  for (const m of text.matchAll(MARK)) { try { const r = GoogleAction.safeParse(JSON.parse(m[1]!)); if (r.success) out.push(r.data); } catch { /* not JSON */ } }
  return out;
}
export const hideGoogleMarks = (text: string) => text.replace(/<<<google \{[^\n]*\}>>>/g, "").replace(/<<<google[^\n]*$/, "").trimEnd();
