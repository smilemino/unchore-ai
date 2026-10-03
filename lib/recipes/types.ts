import type { Lang } from "@/lib/i18n";
import type { z } from "zod";

export type RecipeResult =
  | { ok: true; value?: number; line: string; url?: string; items?: string[] }
  | { ok: false; why: string };

export type RunCtx = {
  lang: Lang;
  tz: string;
  /** Calls the user's own AI (only for ai_digest). */
  ai?: (prompt: string) => Promise<string>;
  fetch?: typeof fetch;
  /** The member's own saved secret by name (vault, decrypted here — never shown to the AI). */
  secret?: (name: string) => Promise<string | null>;
  /** A preview run: read and report, but change nothing outside (lib/recipes/meta-ads.ts pauses nothing). */
  dry?: boolean;
  /** Skill chain: the result of the automation this one runs right after (lib/automation.ts) — data, not instructions. */
  prev?: { title: string; line: string; items?: string[] };
};

export type Recipe<A = Record<string, unknown>> = {
  id: string;
  /** `en` is also the translation key (shown with t()). */
  title: { en: string };
  /** One line for the AI picker: what it does and each argument. */
  catalog: string;
  where: "server" | "browser";
  /** Reads a Korea-only source (Korean site / won prices) — offered only to Korean users (lang ko or Seoul time zone). */
  korea?: boolean;
  /** A Korea-only recipe that also reads other countries: the env switch that opens it to everyone once that version is verified. */
  world?: string;
  args: z.ZodType<A>;
  run(args: A, ctx: RunCtx): Promise<RecipeResult>;
  /** Secrets of the member's own this recipe reads (vault names) — such a recipe can't run outside Unchore (scripts/skills/portable.ts). */
  needs?: string[];
  /** Fixed arguments for the nightly self-check. */
  canary?: A;
};
