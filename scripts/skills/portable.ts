import { RECIPES } from "@/lib/recipes";
import type { Recipe } from "@/lib/recipes/types";

/** Recipes that run on their own in any agent: server-side, without the member's AI (trend_radar's scores and drafts need it), our browser worker or their saved secrets. */
export const PORTABLE: Recipe[] = RECIPES.filter((r) => r.where === "server" && r.id !== "ai_digest" && r.id !== "reminder" && r.id !== "trend_radar" && !r.needs?.length);
