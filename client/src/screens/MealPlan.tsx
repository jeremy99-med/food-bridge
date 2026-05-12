import { useMemo, useState, useEffect } from "react";
import { useApp } from "@/store/app";
import { generateGroceryList } from "@/lib/api";
import Spinner from "@/components/Spinner";
import ErrorAlert from "@/components/ErrorAlert";

const GROCERY_STEPS = [
  { icon: "🛒", text: "Reviewing your meal plan…"         },
  { icon: "📋", text: "Compiling ingredients…"             },
  { icon: "⚖️",  text: "Calculating quantities…"           },
  { icon: "🏪", text: "Organizing by store section…"      },
  { icon: "💰", text: "Checking against your budget…"     },
  { icon: "✅", text: "Almost done…"                       },
];
const GROCERY_FLOAT_ICONS = [
  { emoji: "🥬", top: "9%",  left: "8%",  dur: 6.1, delay: 0    },
  { emoji: "🧅", top: "14%", left: "80%", dur: 7.3, delay: -2.0 },
  { emoji: "🥩", top: "70%", left: "11%", dur: 5.9, delay: -1.2 },
  { emoji: "🧀", top: "76%", left: "80%", dur: 7.0, delay: -3.3 },
  { emoji: "🍞", top: "44%", left: "90%", dur: 7.2, delay: -0.7 },
  { emoji: "🫙", top: "57%", left: "5%",  dur: 6.3, delay: -2.6 },
  { emoji: "🥫", top: "22%", left: "53%", dur: 8.1, delay: -4.1 },
  { emoji: "🧴", top: "86%", left: "46%", dur: 5.6, delay: -1.5 },
];
const GREEN = "#7ded7d";

function GroceryLoader() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setStep(s => (s + 1) % GROCERY_STEPS.length), 2500);
    return () => clearInterval(t);
  }, []);

  const { icon, text } = GROCERY_STEPS[step];

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: "linear-gradient(160deg, hsl(150 60% 97%) 0%, hsl(150 40% 93%) 100%)",
      position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", width: 520, height: 520, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(125,237,125,0.22) 0%, transparent 68%)",
        top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        pointerEvents: "none",
      }} />

      {[0, 1, 2].map(i => (
        <div key={i} style={{
          position: "absolute", width: 104, height: 104, borderRadius: "50%",
          border: `2px solid ${GREEN}`,
          animation: `mp-ring-expand 2.7s ease-out ${i * 0.9}s infinite`,
          pointerEvents: "none",
        }} />
      ))}

      {GROCERY_FLOAT_ICONS.map(({ emoji, top, left, dur, delay }, i) => (
        <div key={i} style={{
          position: "absolute", fontSize: "1.6rem",
          top, left, opacity: 0.35,
          animation: `mp-float ${dur}s ease-in-out ${delay}s infinite`,
          pointerEvents: "none",
        }}>
          {emoji}
        </div>
      ))}

      <div style={{
        position: "relative", zIndex: 10,
        width: 90, height: 90, borderRadius: "50%",
        background: `linear-gradient(135deg, ${GREEN} 0%, #3dc86e 100%)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "2.3rem",
        boxShadow: `0 0 0 8px rgba(125,237,125,0.15), 0 0 40px rgba(125,237,125,0.4)`,
        animation: "mp-float 3s ease-in-out infinite",
      }}>
        <span key={step} style={{ animation: "mp-fade-up 0.3s ease-out" }}>{icon}</span>
      </div>

      <h2 style={{
        marginTop: "2rem", fontSize: "1.5rem", fontWeight: 700,
        letterSpacing: "-0.02em",
        background: `linear-gradient(90deg, hsl(158 60% 25%), ${GREEN}, hsl(158 60% 25%))`,
        backgroundSize: "200% auto",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        animation: "mp-shimmer 3s linear infinite",
      }}>
        Building your grocery list
      </h2>

      <p key={step} style={{
        marginTop: "0.6rem", fontSize: "0.9rem",
        color: "hsl(158 20% 38%)", animation: "mp-fade-up 0.3s ease-out",
        minHeight: "1.3rem",
      }}>
        {text}
      </p>

      <div style={{ display: "flex", gap: 7, marginTop: "1.8rem", alignItems: "center" }}>
        {GROCERY_STEPS.map((_, i) => (
          <div key={i} style={{
            height: 6, borderRadius: 3,
            width: i === step ? 24 : 6,
            background: i === step ? GREEN : "hsl(150 30% 82%)",
            transition: "all 0.35s cubic-bezier(0.4,0,0.2,1)",
            boxShadow: i === step ? `0 0 8px rgba(125,237,125,0.7)` : "none",
          }} />
        ))}
      </div>

      <p style={{ marginTop: "2.5rem", fontSize: "0.75rem", color: "hsl(158 12% 55%)" }}>
        This usually takes 15–30 seconds
      </p>
    </div>
  );
}

interface DayPlan {
  day: string;
  meals: { name: string; description?: string }[];
}

interface MealAlternative {
  name: string;
}

interface AlternativesPool {
  breakfast: MealAlternative[];
  lunch:     MealAlternative[];
  dinner:    MealAlternative[];
}

interface ParsedPlan {
  coverage:     { name: string; key: string; pct: number }[];
  days:         DayPlan[];
  swaps:        { food: string; reason: string }[];
  alternatives: AlternativesPool;
  rawFallback?: string;
}

const NUTRIENT_LABELS: Record<string, string> = {
  calories_kcal: "Calories", protein_g: "Protein", fat_g: "Fat",
  saturated_fat_g: "Sat. Fat", carbohydrates_g: "Carbs", carbs_g: "Carbs", fiber_g: "Fiber",
  added_sugars_g: "Added Sugar", sodium_mg: "Sodium", potassium_mg: "Potassium",
  calcium_mg: "Calcium", iron_mg: "Iron", vitamin_c_mg: "Vitamin C",
  vitamin_d_iu: "Vitamin D", folate_mcg: "Folate", b12_mcg: "Vitamin B12",
  magnesium_mg: "Magnesium", zinc_mg: "Zinc",
};

// Standard RDI reference values (2000 kcal diet)
const NUTRIENT_DV: Record<string, number> = {
  calories_kcal: 2000, protein_g: 50, fat_g: 78, saturated_fat_g: 20,
  carbohydrates_g: 275, carbs_g: 275, fiber_g: 28, added_sugars_g: 50,
  sodium_mg: 2300, potassium_mg: 4700, calcium_mg: 1300, iron_mg: 18,
  vitamin_c_mg: 90, vitamin_d_iu: 800, folate_mcg: 400, b12_mcg: 2.4,
  magnesium_mg: 420, zinc_mg: 11,
};

function nutrientUnit(key: string): string {
  if (key.endsWith("_kcal")) return "kcal";
  if (key.endsWith("_iu"))   return "IU";
  if (key.endsWith("_mcg"))  return "mcg";
  if (key.endsWith("_mg"))   return "mg";
  return "g";
}

function nutrientAmount(key: string, pct: number): string {
  const dv = NUTRIENT_DV[key];
  if (!dv) return `${Math.round(pct)}%`;
  const amount = (pct / 100) * dv;
  const unit = nutrientUnit(key);
  const formatted = unit === "g" || unit === "kcal"
    ? Math.round(amount).toString()
    : amount < 10 ? amount.toFixed(1) : Math.round(amount).toString();
  return `${formatted}${unit}`;
}

const MEAL_META = [
  { label: "Breakfast", icon: "🌅", bg: "bg-amber-50" },
  { label: "Lunch",     icon: "☀️", bg: "bg-sky-50" },
  { label: "Dinner",    icon: "🌙", bg: "bg-indigo-50" },
];

function coverageColor(pct: number): string {
  if (pct >= 90) return "bg-green-500";
  if (pct >= 70) return "bg-yellow-400";
  if (pct >= 50) return "bg-orange-400";
  return "bg-red-500";
}

function coverageTextColor(pct: number): string {
  if (pct >= 90) return "text-green-700";
  if (pct >= 70) return "text-yellow-700";
  if (pct >= 50) return "text-orange-600";
  return "text-red-600";
}

function parseMealContent(raw: string): string {
  return raw
    .replace(/^[^\w\s]*\s*(breakfast|lunch|dinner)\s*[:\-–]\s*/i, "")
    .replace(/^[^\w\s]+\s*/, "")
    .trim();
}

export function parseMealPlan(text: string): ParsedPlan {
  const emptyPool: AlternativesPool = { breakfast: [], lunch: [], dinner: [] };
  const result: ParsedPlan = { coverage: [], days: [], swaps: [], alternatives: emptyPool };
  if (!text) return result;

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const obj = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

      const cov = (obj.nutrient_coverage ?? obj.coverage ?? obj.nutrients) as Record<string, unknown> | unknown[] | undefined;
      if (cov && typeof cov === "object" && !Array.isArray(cov)) {
        result.coverage = Object.entries(cov).map(([key, v]) => ({
          key,
          name: NUTRIENT_LABELS[key] ?? key,
          pct: typeof v === "number" ? v : Number(String(v).replace(/[^\d.]/g, "")) || 0,
        }));
      }

      const days = (obj.days ?? obj.plan ?? obj.meal_plan) as unknown[] | undefined;
      if (Array.isArray(days)) {
        result.days = days.map((d, i) => {
          const dd = d as Record<string, unknown>;
          return {
            day: String(dd.day ?? `Day ${i + 1}`),
            meals: ((dd.meals ?? []) as unknown[]).map((m) => {
              if (typeof m === "string") return { name: m };
              const mm = m as Record<string, unknown>;
              return { name: String(mm.name ?? mm.title ?? "Meal"), description: mm.description as string | undefined };
            }),
          };
        });
      }

      const swaps = (obj.swaps ?? obj.suggested_swaps) as unknown[] | undefined;
      if (Array.isArray(swaps)) {
        result.swaps = swaps.map((s) => {
          if (typeof s === "string") return { food: s, reason: "" };
          const ss = s as Record<string, unknown>;
          return { food: String(ss.food ?? ss.name ?? ""), reason: String(ss.reason ?? ss.gap ?? "") };
        });
      }

      const parseAltList = (raw: unknown): MealAlternative[] => {
        if (!Array.isArray(raw)) return [];
        return (raw as unknown[])
          .slice(0, 5)
          .map((m) =>
            typeof m === "string"
              ? { name: m }
              : { name: String((m as Record<string, unknown>).name ?? "") }
          )
          .filter((a) => a.name.length > 0);
      };
      const alts = (obj.alternatives ?? obj.alt_meals) as Record<string, unknown> | undefined;
      if (alts && typeof alts === "object" && !Array.isArray(alts)) {
        result.alternatives = {
          breakfast: parseAltList(alts.breakfast),
          lunch:     parseAltList(alts.lunch),
          dinner:    parseAltList(alts.dinner),
        };
      }

      if (result.days.length) return result;
    } catch { /* ignore */ }
  }

  const dayBlocks = text.split(/(?=Day\s*\d)/i).filter((b) => /Day\s*\d/i.test(b));
  if (dayBlocks.length) {
    result.days = dayBlocks.slice(0, 7).map((blk, i) => {
      const dayMatch = blk.match(/Day\s*\d+/i);
      const meals = blk.split(/\r?\n/).map((l) => l.trim()).filter((l) => /^[-*•]/.test(l)).slice(0, 3)
        .map((l) => ({ name: l.replace(/^[-*•]\s*/, "") }));
      return { day: dayMatch ? dayMatch[0] : `Day ${i + 1}`, meals };
    });
  }
  result.rawFallback = result.days.length ? undefined : text;
  return result;
}

const MealPlan = () => {
  const { mealPlanResponse, profileId, selectedFoods, setScreen, setResponse } = useApp();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeDay, setActiveDay] = useState(0);
  const [swapping, setSwapping] = useState<{ dayIdx: number; mealIdx: number } | null>(null);
  const [swappedMeals, setSwappedMeals] = useState<Record<string, string>>({});
  const [justSwapped, setJustSwapped] = useState<string | null>(null);

  const plan = useMemo(() => parseMealPlan(mealPlanResponse), [mealPlanResponse]);

  const MEAL_TYPE_KEYS: Array<keyof AlternativesPool> = ["breakfast", "lunch", "dinner"];

  const getAlternatives = (pool: AlternativesPool, mealIdx: number) =>
    pool[MEAL_TYPE_KEYS[mealIdx] ?? "breakfast"].slice(0, 5);

  const handleSwap = (dayIdx: number, mealIdx: number, newName: string) => {
    const key = `${dayIdx}-${mealIdx}`;
    setSwappedMeals((prev) => ({ ...prev, [key]: newName }));
    setSwapping(null);
    setJustSwapped(key);
    setTimeout(() => setJustSwapped(null), 1800);
  };

  const generateGrocery = async () => {
    if (!profileId) { setError("Profile not found. Please restart."); return; }
    setError(null);
    setLoading(true);
    try {
      const foods = selectedFoods.map((f) => ({ fdc_id: Number(f.fdc_id), name: f.name }));
      const result = await generateGroceryList(profileId, foods, mealPlanResponse);
      setResponse("grocery", result);
      setScreen(5);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate list");
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <GroceryLoader />;

  const currentDay = plan.days[activeDay];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="px-5 pt-8 pb-4 max-w-xl mx-auto w-full">
        <p className="fb-section-title">Step 4 of 5</p>
        <h1 className="text-3xl font-bold mt-1">Your 7-Day Plan</h1>
      </header>

      <main className="flex-1 max-w-xl mx-auto w-full px-5 pb-32 space-y-6">
        {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

        {/* Day selector */}
        {plan.days.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
            {plan.days.map((_d, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActiveDay(i)}
                className={`shrink-0 flex flex-col items-center justify-center w-14 h-14 border-2 border-foreground text-xs font-bold transition-colors
                  ${activeDay === i ? "bg-foreground text-background" : "bg-background text-foreground"}`}
              >
                <span className="text-[10px] font-normal opacity-70">DAY</span>
                <span className="text-lg leading-none">{i + 1}</span>
              </button>
            ))}
          </div>
        )}

        {/* Meals for active day */}
        {currentDay && (
          <section className="space-y-3">
            <h2 className="fb-section-title">{currentDay.day}</h2>
            <div className="space-y-3">
              {currentDay.meals.map((meal, i) => {
                const meta       = MEAL_META[i] ?? MEAL_META[0];
                const key        = `${activeDay}-${i}`;
                const displayName = swappedMeals[key] ?? (parseMealContent(meal.name) || meal.name);
                const isSwapping  = swapping?.dayIdx === activeDay && swapping?.mealIdx === i;
                const wasSwapped  = justSwapped === key;
                const altOptions  = getAlternatives(plan.alternatives, i);
                const hasAlts     = altOptions.length > 0;
                return (
                  <div key={i}>
                    <div
                      className={`border-2 border-foreground p-4 ${meta.bg} ${wasSwapped ? "ring-2 ring-foreground ring-offset-1" : ""}`}
                      style={{ transition: "box-shadow 0.4s" }}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{meta.icon}</span>
                          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{meta.label}</span>
                        </div>
                        {hasAlts && (
                          <button
                            type="button"
                            onClick={() => setSwapping(isSwapping ? null : { dayIdx: activeDay, mealIdx: i })}
                            className="fb-btn-outline"
                            style={{ height: "2rem", padding: "0 0.75rem", fontSize: "0.75rem" }}
                            aria-expanded={isSwapping}
                            aria-label={`Swap ${meta.label}`}
                          >
                            {isSwapping ? "Cancel" : "Swap"}
                          </button>
                        )}
                      </div>
                      <p className="font-semibold text-base leading-snug">{displayName}</p>
                      {wasSwapped && (
                        <p className="text-xs font-medium mt-1 text-foreground">Meal updated ✓</p>
                      )}
                      {meal.description && !wasSwapped && (
                        <p className="text-sm text-muted-foreground mt-1">{meal.description}</p>
                      )}
                    </div>
                    {isSwapping && (
                      <div className="border-2 border-t-0 border-foreground bg-white p-3 space-y-2">
                        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                          Choose a replacement
                        </p>
                        {altOptions.map((alt, ai) => (
                          <button
                            key={ai}
                            type="button"
                            onClick={() => handleSwap(activeDay, i, alt.name)}
                            className="w-full text-left border border-foreground px-3 py-2 text-sm font-medium hover:bg-foreground hover:text-white transition-colors"
                          >
                            {alt.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Nutrient coverage */}
        {plan.coverage.length > 0 && (
          <section className="space-y-3">
            <h2 className="fb-section-title">Nutrient coverage</h2>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              {plan.coverage.map((c) => {
                const pct = Math.min(100, Math.max(0, c.pct));
                return (
                  <div key={c.name} className="cursor-default group">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground truncate pr-1">{c.name}</span>
                      <span className={`font-bold tabular-nums shrink-0 ${coverageTextColor(c.pct)}`}>
                        <span className="group-hover:hidden">{Math.round(c.pct)}%</span>
                        <span className="hidden group-hover:inline">{nutrientAmount(c.key, c.pct)}</span>
                      </span>
                    </div>
                    <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${coverageColor(c.pct)}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Suggested swaps */}
        {plan.swaps.length > 0 && (
          <section className="space-y-2">
            <h2 className="fb-section-title">💡 Suggested swaps</h2>
            {plan.swaps.map((s, i) => (
              <div key={i} className="border border-foreground p-3 flex items-start gap-3">
                <span className="text-lg shrink-0">🔄</span>
                <div>
                  <p className="font-semibold text-sm">{s.food}</p>
                  {s.reason && <p className="text-xs text-muted-foreground mt-0.5">{s.reason}</p>}
                </div>
              </div>
            ))}
          </section>
        )}

        {plan.rawFallback && (
          <div className="border border-foreground p-4 text-sm whitespace-pre-wrap">{plan.rawFallback}</div>
        )}
      </main>

      <footer className="fixed bottom-0 left-0 right-0 bg-background border-t border-foreground">
        <div className="max-w-xl mx-auto px-5 py-4 flex items-center gap-3">
          <button type="button" onClick={() => setScreen(3)} className="fb-btn-outline">Back</button>
          <button onClick={generateGrocery} className="fb-btn flex-1">Generate Grocery List</button>
        </div>
      </footer>
    </div>
  );
};

export default MealPlan;
