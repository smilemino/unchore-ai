// Our team's picks (plan v11 §13 D): the «checked every night» mark is true only for recipes the nightly self-check really runs.
import { describe, expect, it } from "vitest";
import { CHECKED_NIGHTLY, FOUNDER_PICKS, RECIPE_TITLES } from "@/lib/recipe-titles";
import { RECIPES } from "@/lib/recipes";

describe("our team's picks", () => {
  it("marks as checked exactly the recipes with a nightly canary", () => {
    expect([...CHECKED_NIGHTLY].sort()).toEqual(RECIPES.filter((r) => r.canary).map((r) => r.id).sort());
  });
  it("each pick is a real recipe with a first sentence", () => {
    expect(FOUNDER_PICKS.length).toBeGreaterThanOrEqual(3);
    for (const p of FOUNDER_PICKS) {
      expect(RECIPE_TITLES[p.recipe]).toBeTruthy();
      expect(p.ask.length).toBeGreaterThan(10);
      expect(p.title.length).toBeLessThan(40);
    }
  });
});
