import { useMemo, useState } from "react";
import { useApp } from "@/store/app";
import { resetSession, saveGroceryList } from "@/lib/api";
import { categoryIcon } from "@/lib/categories";
import Spinner from "@/components/Spinner";
import ErrorAlert from "@/components/ErrorAlert";

interface GroceryItem {
  name: string;
  brand?: string;
  quantity?: number;
  price?: number;
  source?: "live" | "estimate";
  category?: string;
  image_url?: string;
}

interface ParsedGrocery {
  items: GroceryItem[];
  total: number;
  budgetAdjusted?: boolean;
  rawFallback?: string;
}

interface MealInstructions {
  name: string;
  prep_time?: string;
  cook_time?: string;
  temperature?: string | null;
  servings?: number;
  ingredients?: string[];
  steps?: string[];
}

interface MealDayPlan {
  day: string;
  meals: MealInstructions[];
}

function mealIcon(name: string): string {
  const l = name.toLowerCase();
  if (l.includes("breakfast")) return "🌅";
  if (l.includes("lunch")) return "☀️";
  if (l.includes("dinner")) return "🌙";
  return "🍽️";
}

function stripMealPrefix(name: string): string {
  return name.replace(/^(breakfast|lunch|dinner|snack)\s*[:–\-]\s*/i, "").trim();
}

function parseItem(i: Record<string, unknown>, category?: string): GroceryItem {
  const priceRaw = i.estimated_unit_price_usd ?? i.price ?? i.estimated_price ?? i.cost;
  const price = typeof priceRaw === "number" ? priceRaw : Number(String(priceRaw ?? "").replace(/[^\d.]/g, "")) || 0;
  const src = String(i.price_source ?? i.source ?? "").toLowerCase();
  const qtyRaw = i.quantity_needed ?? i.quantity;
  const qty = qtyRaw != null ? Number(qtyRaw) : undefined;
  return {
    name: String(i.description ?? i.name ?? i.food ?? "Item"),
    brand: (i.brand_name ?? i.brand) as string | undefined,
    quantity: qty,
    price,
    source: src.includes("open") || src.includes("live") ? "live" : src.includes("est") ? "estimate" : undefined,
    category,
    image_url: (i.image_url as string | undefined) ?? undefined,
  };
}

function parseGrocery(text: string): ParsedGrocery {
  const result: ParsedGrocery = { items: [], total: 0 };
  if (!text) return result;

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const obj = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

      const totalRaw = obj.total_estimated_cost_usd ?? obj.total ?? obj.estimated_total ?? obj.total_cost;
      result.total = typeof totalRaw === "number" ? totalRaw : Number(String(totalRaw ?? "").replace(/[^\d.]/g, "")) || 0;
      result.budgetAdjusted = obj.budget_adjusted === true;

      const groceryList = obj.grocery_list ?? obj.items ?? obj.list;
      if (groceryList && typeof groceryList === "object" && !Array.isArray(groceryList)) {
        for (const [cat, catItems] of Object.entries(groceryList as Record<string, unknown>)) {
          if (Array.isArray(catItems)) {
            for (const it of catItems) {
              result.items.push(parseItem(it as Record<string, unknown>, cat));
            }
          }
        }
        if (result.items.length) return result;
      }

      if (Array.isArray(groceryList)) {
        result.items = groceryList.map((it) => parseItem(it as Record<string, unknown>));
        if (result.items.length) return result;
      }
    } catch { /* ignore */ }
  }

  result.rawFallback = text;
  return result;
}

function parseMealDays(text: string): MealDayPlan[] {
  if (!text) return [];
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];
    const obj = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const days = (obj.days ?? obj.plan ?? obj.meal_plan) as MealDayPlan[] | undefined;
    return Array.isArray(days) ? days : [];
  } catch {
    return [];
  }
}

interface MealPlanSectionProps {
  days: MealDayPlan[];
}

export function MealPlanSection({ days }: MealPlanSectionProps) {
  const [open, setOpen] = useState(false);
  const [expandedMeal, setExpandedMeal] = useState<string | null>(null);

  if (!days.length) return null;

  const toggleMeal = (key: string) =>
    setExpandedMeal((prev) => (prev === key ? null : key));

  return (
    <section className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-baseline justify-between border-b border-foreground pb-2"
      >
        <h2 className="font-bold text-lg">📋 Your 7-Day Meal Plan</h2>
        <span className="text-sm">{open ? "▲" : "▾"}</span>
      </button>

      {open && (
        <div className="space-y-6">
          {days.map((day, dayIdx) => (
            <div key={dayIdx} className="space-y-1.5">
              <p className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                {day.day}
              </p>
              <ul className="space-y-1">
                {(day.meals ?? []).map((meal, mealIdx) => {
                  const key = `${dayIdx}-${mealIdx}`;
                  const isOpen = expandedMeal === key;
                  const hasInstructions =
                    (meal.ingredients && meal.ingredients.length > 0) ||
                    (meal.steps && meal.steps.length > 0);

                  return (
                    <li key={mealIdx}>
                      <button
                        type="button"
                        onClick={() => hasInstructions && toggleMeal(key)}
                        className={`w-full text-left px-3 py-2.5 border transition-colors ${
                          isOpen
                            ? "border-foreground"
                            : "border-surface-2 hover:border-foreground"
                        } ${!hasInstructions ? "cursor-default" : ""}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">
                            {mealIcon(meal.name)} {stripMealPrefix(meal.name)}
                          </span>
                          {hasInstructions && (
                            <span className="text-xs text-muted-foreground shrink-0">
                              {isOpen ? "▲" : "▾"}
                            </span>
                          )}
                        </div>
                        {(meal.prep_time || meal.cook_time) && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {[
                              meal.prep_time && `Prep ${meal.prep_time}`,
                              meal.cook_time && `Cook ${meal.cook_time}`,
                              meal.temperature && `${meal.temperature}`,
                              meal.servings != null && `Serves ${meal.servings}`,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        )}
                      </button>

                      {isOpen && hasInstructions && (
                        <div className="border border-t-0 border-foreground px-3 py-3 space-y-3">
                          {meal.ingredients && meal.ingredients.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wider mb-1.5">
                                Ingredients
                              </p>
                              <ul className="space-y-0.5">
                                {meal.ingredients.map((ing, i) => (
                                  <li key={i} className="text-xs text-muted-foreground">
                                    · {ing}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {meal.steps && meal.steps.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wider mb-1.5">
                                Instructions
                              </p>
                              <ol className="space-y-1.5">
                                {meal.steps.map((step, i) => (
                                  <li key={i} className="text-xs text-muted-foreground">
                                    {i + 1}. {step}
                                  </li>
                                ))}
                              </ol>
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const GroceryList = () => {
  const { groceryResponse, mealPlanResponse, preferences, setScreen, setReturnScreen, reset, authUser } = useApp();
  const [resetting, setResetting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const parsed = useMemo(() => parseGrocery(groceryResponse), [groceryResponse]);
  const mealDays = useMemo(() => parseMealDays(mealPlanResponse), [mealPlanResponse]);
  const budget = Number(preferences.budget) || 0;
  const total = parsed.total || parsed.items.reduce((s, i) => s + (i.price ?? 0), 0);
  const within      = budget > 0 ? total <= budget : true;
  const slightlyOver = budget > 0 && total > budget && total <= budget + 10;
  const overBudget  = budget > 0 && total > budget + 10;
  const pct = budget > 0 ? Math.min(100, (total / budget) * 100) : 0;

  const grouped = useMemo(() => {
    const map = new Map<string, GroceryItem[]>();
    for (const it of parsed.items) {
      const cat = it.category || "Other";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(it);
    }
    return Array.from(map.entries());
  }, [parsed.items]);

  const spiceGroups = grouped.filter(([cat]) => cat === "Spices & Pantry");
  const mainGroups  = grouped.filter(([cat]) => cat !== "Spices & Pantry");

  const groupedAsRecord = useMemo(() => {
    const rec: Record<string, unknown[]> = {};
    for (const [cat, items] of grouped) rec[cat] = items;
    return rec;
  }, [grouped]);

  const startOver = async () => {
    setResetting(true);
    try {
      await resetSession();
      reset();
    } finally {
      setResetting(false);
    }
  };

  const handleSave = async () => {
    setSaveError(null);
    setSaving(true);
    try {
      let mealPlanJson: object | null = null;
      try {
        const jsonMatch = mealPlanResponse?.match(/\{[\s\S]*\}/);
        if (jsonMatch) mealPlanJson = JSON.parse(jsonMatch[0]) as object;
      } catch { /* ignore */ }
      await saveGroceryList({
        total_estimated_cost_usd: total,
        grocery_list: groupedAsRecord,
        meal_plan_json: mealPlanJson,
      });
      setSaved(true);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveUnauthenticated = () => {
    setReturnScreen(5);
    setScreen(6);
  };

  if (resetting) {
    return <div className="min-h-screen flex items-center justify-center"><Spinner message="Resetting..." /></div>;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-5 pt-5 pb-3 max-w-xl mx-auto w-full" style={{ background: 'var(--color-background)' }}>
        <p className="fb-section-title">Step 5 of 5</p>
        <div className="mt-1 flex items-start justify-between gap-4">
          <h1 className="text-[2.6rem] fb-display leading-none">Your Grocery List</h1>
          <p className="text-2xl font-extrabold tabular-nums text-[#0f4c2b]">${total.toFixed(2)}</p>
        </div>

        {budget > 0 && (
          <div className="mt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-[#4d7560]">Budget ${budget.toFixed(0)}</span>
              <span className="font-bold">
                {within
                  ? "Within budget ✓"
                  : slightlyOver
                  ? <>Slightly over (~${(total - budget).toFixed(0)} over){" "}
                      <span
                        title="Up to $10 over budget — all planned meals are included. Spices are not counted toward this total."
                        className="cursor-help text-[#4d7560]"
                      >ⓘ</span></>
                  : "Over budget ✗"}
              </span>
            </div>
            <div className="h-2 bg-[#daeade] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${overBudget ? "bg-[#c0392b]" : slightlyOver ? "bg-[#c9820a]" : "bg-[#0f4c2b]"}`}
                style={{ width: `${pct}%`, transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)" }}
              />
            </div>
          </div>
        )}
      </header>

      <main className="flex-1 max-w-xl mx-auto w-full px-5 pb-24 pt-3 space-y-6">
        {saveError && <ErrorAlert message={saveError} onDismiss={() => setSaveError(null)} />}

        {parsed.budgetAdjusted && (
          <div className="border border-foreground px-4 py-3 text-sm">
            Some items or quantities were adjusted to fit your budget. Your meal plan is still complete — quantities reflect one week of shopping.
          </div>
        )}

        {parsed.rawFallback && (
          <div className="border border-foreground p-4 text-sm whitespace-pre-wrap">{parsed.rawFallback}</div>
        )}

        {spiceGroups.length > 0 && spiceGroups.map(([, items]) => (
          <section key="Spices & Pantry" className="space-y-2.5">
            <div className="flex items-baseline justify-between border-b border-[#daeade] pb-2">
              <h2 className="font-extrabold text-sm tracking-[-0.01em] text-[#111a14]">🌿 Spices & Pantry</h2>
              <span className="text-[11px] text-[#4d7560] tabular-nums italic">not included in budget</span>
            </div>
            <p className="text-[11px] text-[#4d7560]">Check your pantry — you may already have these.</p>
            <ul className="space-y-2">
              {items.map((it, i) => (
                <li key={i} className="fb-grocery-card">
                  <div className="w-11 h-11 shrink-0 rounded-lg bg-[#edf5f0] flex items-center justify-center text-lg">
                    🌿
                  </div>
                  <p className="font-semibold text-sm leading-snug text-[#111a14] flex-1">{it.name}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {mainGroups.map(([cat, items]) => (
          <section key={cat} className="space-y-2.5">
            <div className="flex items-baseline justify-between border-b border-[#daeade] pb-2">
              <h2 className="font-extrabold text-sm tracking-[-0.01em] text-[#111a14]">{categoryIcon(cat)} {cat}</h2>
              <span className="text-[11px] text-[#4d7560] tabular-nums">{items.length} item{items.length === 1 ? "" : "s"}</span>
            </div>
            <ul className="space-y-2">
              {items.map((it, i) => (
                <li key={i} className="fb-grocery-card">
                  <div className="w-11 h-11 shrink-0 rounded-lg overflow-hidden bg-[#edf5f0]
                                  flex items-center justify-center text-lg
                                  shadow-[inset_0_1px_3px_rgba(0,0,0,0.06)]">
                    {it.image_url
                      ? <img src={it.image_url} alt={it.name} className="w-full h-full object-cover" />
                      : <span>{categoryIcon(it.category ?? "Other")}</span>
                    }
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm leading-snug text-[#111a14]">{it.name}</p>
                    {it.brand && <p className="text-[11px] text-[#4d7560] mt-0.5">{it.brand}</p>}
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                      {it.quantity != null && typeof it.price === "number" && (
                        <span className="text-[11px] text-[#4d7560] tabular-nums">
                          x{it.quantity} × ${it.price.toFixed(2)}
                        </span>
                      )}
                      {it.source && (
                        <span className={`text-[9px] font-bold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-full
                          ${it.source === "live"
                            ? "bg-[#0f4c2b] text-white"
                            : "bg-[#edf5f0] text-[#4d7560]"}`}>
                          {it.source === "live" ? "live" : "est."}
                        </span>
                      )}
                    </div>
                  </div>
                  {typeof it.price === "number" && (
                    <span className="text-sm font-bold tabular-nums shrink-0 text-[#0f4c2b] pt-0.5">
                      ${((it.quantity ?? 1) * it.price).toFixed(2)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}

        <MealPlanSection days={mealDays} />
      </main>

      <footer className="fb-footer">
        <div className="max-w-xl mx-auto px-5 py-3 flex items-center gap-3">
          <button type="button" onClick={() => setScreen(4)} className="fb-btn-outline">Back</button>
          {authUser ? (
            <button
              type="button"
              onClick={saved ? () => setScreen(8) : handleSave}
              disabled={saving}
              className="fb-btn-outline"
            >
              {saved ? "View saved ✓" : saving ? "Saving…" : "Save list"}
            </button>
          ) : (
            <button type="button" onClick={handleSaveUnauthenticated} className="fb-btn-outline">
              Save list
            </button>
          )}
          <button onClick={startOver} className="fb-btn flex-1">Start Over</button>
        </div>
      </footer>
    </div>
  );
};

export default GroceryList;
