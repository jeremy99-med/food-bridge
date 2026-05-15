import { describe, it, expect } from "vitest";
import { parseMealPlan } from "../MealPlan";

const FULL_PLAN = JSON.stringify({
  days: [
    {
      day: "Day 1",
      meals: [
        { name: "Breakfast: Steel Cut Oats" },
        { name: "Lunch: Lentil Soup" },
        { name: "Dinner: Tofu Stir-fry" },
      ],
    },
  ],
  nutrient_coverage: { calories_kcal: 92, protein_g: 108, fiber_g: 94 },
  suggested_swaps: [
    { original: "Candy Bar", replacement: "Mixed Berries", reason: "Diabetes" },
  ],
  alternatives: {
    breakfast: [
      { name: "Greek Yogurt Parfait" },
      { name: "Scrambled Eggs with Spinach" },
      { name: "Overnight Oats with Chia" },
      { name: "Avocado Toast" },
      { name: "Cottage Cheese with Fruit" },
    ],
    lunch: [
      { name: "Chicken Salad" },
      { name: "Lentil Vegetable Soup" },
      { name: "Brown Rice Bowl" },
      { name: "Turkey Wrap" },
      { name: "Quinoa Tabbouleh" },
    ],
    dinner: [
      { name: "Baked Salmon with Broccoli" },
      { name: "Chicken Stir-fry" },
      { name: "Black Bean Tacos" },
      { name: "Turkey Meatballs" },
      { name: "Lentil Dal" },
    ],
  },
});

describe("parseMealPlan", () => {
  it("returns empty result for empty string", () => {
    const result = parseMealPlan("");
    expect(result.days).toHaveLength(0);
    expect(result.coverage).toHaveLength(0);
    expect(result.alternatives.breakfast).toHaveLength(0);
    expect(result.alternatives.lunch).toHaveLength(0);
    expect(result.alternatives.dinner).toHaveLength(0);
  });

  it("parses days and meals correctly", () => {
    const result = parseMealPlan(FULL_PLAN);
    expect(result.days).toHaveLength(1);
    expect(result.days[0].day).toBe("Day 1");
    expect(result.days[0].meals).toHaveLength(3);
  });

  it("parses nutrient_coverage correctly", () => {
    const result = parseMealPlan(FULL_PLAN);
    const cal = result.coverage.find((c) => c.key === "calories_kcal");
    expect(cal).toBeDefined();
    expect(cal!.pct).toBe(92);
  });

  it("parses alternatives — 5 per meal type", () => {
    const result = parseMealPlan(FULL_PLAN);
    expect(result.alternatives.breakfast).toHaveLength(5);
    expect(result.alternatives.lunch).toHaveLength(5);
    expect(result.alternatives.dinner).toHaveLength(5);
  });

  it("each alternative has a non-empty name", () => {
    const result = parseMealPlan(FULL_PLAN);
    for (const type of ["breakfast", "lunch", "dinner"] as const) {
      for (const alt of result.alternatives[type]) {
        expect(alt.name.length).toBeGreaterThan(0);
      }
    }
  });

  it("handles missing alternatives key gracefully", () => {
    const noAlts = JSON.stringify({ days: [{ day: "Day 1", meals: [] }] });
    const result = parseMealPlan(noAlts);
    expect(result.alternatives.breakfast).toHaveLength(0);
    expect(result.alternatives.lunch).toHaveLength(0);
    expect(result.alternatives.dinner).toHaveLength(0);
  });

  it("truncates alternatives list to 5 even if backend returns more", () => {
    const tooMany = JSON.parse(FULL_PLAN);
    tooMany.alternatives.breakfast.push({ name: "Extra Meal" });
    const result = parseMealPlan(JSON.stringify(tooMany));
    expect(result.alternatives.breakfast).toHaveLength(5);
  });

  it("handles alternatives as plain strings", () => {
    const withStrings = JSON.parse(FULL_PLAN);
    withStrings.alternatives.breakfast = ["Oatmeal", "Eggs", "Yogurt", "Toast", "Cereal"];
    const result = parseMealPlan(JSON.stringify(withStrings));
    expect(result.alternatives.breakfast).toHaveLength(5);
    expect(result.alternatives.breakfast[0].name).toBe("Oatmeal");
  });

  it("JSON embedded in prose is still parsed correctly", () => {
    const withProse = `Here is your meal plan:\n${FULL_PLAN}\nEnjoy!`;
    const result = parseMealPlan(withProse);
    expect(result.days).toHaveLength(1);
    expect(result.alternatives.dinner).toHaveLength(5);
  });
});

// Swap interaction behaviour is tested via component tests.
// These stubs document expected behaviour for future @testing-library/react tests.
describe("swap interaction (integration stubs)", () => {
  it.todo("Swap button appears on each meal card when alternatives exist");
  it.todo("clicking Swap opens the alternatives panel for that card only");
  it.todo("selecting an alternative replaces the displayed meal name");
  it.todo("'Meal updated ✓' confirmation appears briefly after swap");
  it.todo("only one alternatives panel can be open at a time");
  it.todo("swap selection persists when switching day tabs and returning");
  it.todo("Swap button is hidden when no alternatives exist for that meal type");
});
