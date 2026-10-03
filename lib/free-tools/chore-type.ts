// Free tool «what kind of chore-doer are you» (benchmark 2026-10-01, play type): six quick picks → one of four types,
// a result worth showing a friend (its own link), and the first thing Unchore would take off your hands. No AI, no login.
import { k } from "../i18n";

export type TypeId = "firefighter" | "collector" | "juggler" | "perfectionist";
export const TYPES: Record<TypeId, { emoji: string; name: string; line: string; first: string }> = {
  firefighter: { emoji: "🧯", name: k("The Firefighter"), line: k("You fix things the moment they catch fire — and remember the deadline the day it's due."), first: k("Remind me of every deadline three days and one day before") },
  collector: { emoji: "📚", name: k("The Collector"), line: k("You keep twenty tabs open to check again later. Later rarely comes."), first: k("Tell me when a web page posts something new") },
  juggler: { emoji: "🤹", name: k("The Juggler"), line: k("You do the same small checks many times a day — prices, mail, numbers — and each one steals a few minutes."), first: k("Tell me the dollar exchange rate every morning") },
  perfectionist: { emoji: "🎯", name: k("The Perfectionist"), line: k("You'd rather do it yourself to get it right. So you do everything yourself."), first: k("Send me the news on a topic every morning") },
};

export const QUESTIONS: { q: string; a: [string, TypeId][] }[] = [
  { q: k("A bill is due next week. You…"), a: [[k("Pay it the night it's due"), "firefighter"], [k("Save the email to deal with later"), "collector"], [k("Check the amount three times this week"), "juggler"], [k("Pay it now and double-check the receipt"), "perfectionist"]] },
  { q: k("Your browser right now has…"), a: [[k("One tab — the fire of the day"), "firefighter"], [k("More tabs than I can count"), "collector"], [k("The same five sites I reload all day"), "juggler"], [k("A neat set of bookmarks"), "perfectionist"]] },
  { q: k("A price you care about (a flight, a coin, a product)…"), a: [[k("I check it when I suddenly remember"), "firefighter"], [k("I saved the page somewhere"), "collector"], [k("I check it several times a day"), "juggler"], [k("I keep a sheet of the prices over time"), "perfectionist"]] },
  { q: k("Monday morning feels like…"), a: [[k("Putting out last week's fires"), "firefighter"], [k("Digging through what I saved"), "collector"], [k("A long list of small checks"), "juggler"], [k("Planning the week in detail"), "perfectionist"]] },
  { q: k("Someone offers to handle a chore for you. You…"), a: [[k("Yes — if they remember the deadline"), "firefighter"], [k("Yes, but I'll forget I asked"), "collector"], [k("Yes, then I'd check on it anyway"), "juggler"], [k("Only if they do it exactly my way"), "perfectionist"]] },
  { q: k("The chore that bothers you most…"), a: [[k("Missing a deadline"), "firefighter"], [k("Losing track of things I meant to read"), "collector"], [k("Checking the same numbers again and again"), "juggler"], [k("Redoing work someone else did badly"), "perfectionist"]] },
];

/** The type picked most (ties: the one picked last among them). */
export function choreType(picks: TypeId[]): TypeId {
  const n = new Map<TypeId, number>();
  for (const p of picks) n.set(p, (n.get(p) ?? 0) + 1);
  let best: TypeId = picks[picks.length - 1] ?? "juggler";
  for (const [id, c] of n) if (c > (n.get(best) ?? 0)) best = id;
  return best;
}
export const isType = (x: unknown): x is TypeId => typeof x === "string" && x in TYPES;
