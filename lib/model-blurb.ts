import { k } from "./i18n";

/** One line on what each AI is good at, shown next to its name where the member picks an AI (ported from AI Soul's
 *  EnginePicker «what it's good at» line). English source; the caller passes it through t(). Short enough for a phone.
 *  Matched on the model name with the connection prefix (sub:, cx:, uc:, gemini:, …) and company folder removed. */
const BLURBS: [RegExp, string][] = [
  [/fable/, k("Thinks the deepest — big decisions, strategy, money math")],
  [/opus/, k("Reliable for most work — writing, summaries, plans, code, images and PDFs")],
  [/sonnet/, k("Everyday work, quickly — short writing and simple tidying")],
  [/haiku/, k("Fastest for simple jobs — short rewrites and lists")],
  [/gpt-6-astra/, k("Strong at research, tables and numbers; starts a little slower")],
  [/gpt-6-sol/, k("Good at code, research and math, lighter on your limits")],
  [/gpt-6-luna/, k("Sorting, summaries and simple jobs at the lowest cost")],
  [/deepseek-reasoner/, k("Thinks step by step before answering; can't read images")],
  [/deepseek/, k("Everyday writing and summaries, cheaply; can't read images")],
  [/glm/, k("Strong at code and multi-step work; can't read images")],
  [/kimi/, k("Quick chat and translation; can't read images")],
  [/gemini.*pro/, k("Careful answers over long documents and images")],
  [/gemini|grok/, k("Quick short answers")],
  [/^openrouter\/auto$/, k("OpenRouter picks a model for each question")],
];

export function modelBlurb(id: string): string | null {
  const name = id.replace(/^[a-z]+:/, "");
  return BLURBS.find(([re]) => re.test(id === "openrouter/auto" ? id : name))?.[1] ?? null;
}
