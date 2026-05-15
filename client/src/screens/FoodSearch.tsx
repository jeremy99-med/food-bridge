import { useState } from "react";
import { useApp, type FoodItem } from "@/store/app";
import { searchFoods, generateMealPlan } from "@/lib/api";
import Spinner from "@/components/Spinner";
import ErrorAlert from "@/components/ErrorAlert";
import { LoadingScreen, ForkKnifeIcon, MEAL_SHAPES, type LoadStep } from "@/components/LoadingScreen";

const MP_STEPS: LoadStep[] = [
  { text: "Analyzing your food selections…"   },
  { text: "Calculating nutrient coverage…"     },
  { text: "Matching your health profile…"      },
  { text: "Designing your 7-day plan…"         },
  { text: "Balancing meals & variety…"         },
  { text: "Putting the finishing touches…"     },
];

function MealPlanLoader() {
  return (
    <LoadingScreen
      title="Building your meal plan"
      steps={MP_STEPS}
      centerIcon={<ForkKnifeIcon />}
      shapes={MEAL_SHAPES}
    />
  );
}

const DATA_TYPE_LABELS: Record<string, string> = {
  foundation_food:   "Foundation",
  sr_legacy_food:    "Standard",
  branded_food:      "Branded",
  survey_fndds_food: "Survey",
  sub_sample_food:   "Sample",
};

function scoreColor(score: number): string {
  if (score >= 70) return "bg-green-500 text-white";
  if (score >= 45) return "bg-yellow-400 text-black";
  return "bg-red-400 text-white";
}

function shortName(name: string): string {
  // Strip long marketing suffixes after the 3rd comma
  const parts = name.split(",");
  return parts.slice(0, 3).join(",").trim();
}

const FoodSearch = () => {
  const { setScreen, setResponse, selectedFoods, setSelectedFoods, profileId } = useApp();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [building, setBuilding] = useState(false);
  const [results, setResults] = useState<FoodItem[]>([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim()) return;
    setError(null);
    setSearching(true);
    try {
      const foods = await searchFoods(query.trim(), profileId || undefined);
      setResults(foods.map((f) => ({ ...f, data_type: f.data_type ?? undefined })));
      setSearched(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setSearching(false);
    }
  };

  const toggle = (f: FoodItem) => {
    const exists = selectedFoods.find((s) => s.fdc_id === f.fdc_id);
    if (exists) setSelectedFoods(selectedFoods.filter((s) => s.fdc_id !== f.fdc_id));
    else setSelectedFoods([...selectedFoods, f]);
  };

  const isSelected = (f: FoodItem) => !!selectedFoods.find((s) => s.fdc_id === f.fdc_id);

  const buildPlan = async () => {
    if (!profileId) { setError("Profile not found. Please restart."); return; }
    setError(null);
    setBuilding(true);
    try {
      const foods = selectedFoods.map((f) => ({ fdc_id: Number(f.fdc_id), name: f.name }));
      const result = await generateMealPlan(profileId, foods);
      setResponse("mealPlan", result);
      setScreen(4);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to build plan");
    } finally {
      setBuilding(false);
    }
  };

  if (building) return <MealPlanLoader />;

  const needed = Math.max(0, 3 - selectedFoods.length);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="px-5 pt-5 pb-3 max-w-xl mx-auto w-full" style={{ background: 'var(--color-background)' }}>
        <p className="fb-section-title">Step 3 of 5</p>
        <h1 className="text-[2.5rem] fb-display leading-none mt-1">Find foods</h1>
        <p className="text-sm text-[#4d7560] mt-1">
          {needed > 0 ? `Pick at least ${needed} more food${needed > 1 ? "s" : ""}.` : "Great selection! Add more or build your plan."}
        </p>
      </header>

      {/* Search bar */}
      <div className="px-5 max-w-xl mx-auto w-full">
        <form onSubmit={search} className="flex gap-2">
          <input
            className="fb-input flex-1"
            placeholder="e.g. chicken, brown rice, tofu..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit" className="fb-btn px-5" disabled={searching || !query.trim()}>
            {searching ? "…" : "Search"}
          </button>
        </form>
      </div>

      {/* Selected chips */}
      {selectedFoods.length > 0 && (
        <div className="px-5 max-w-xl mx-auto w-full mt-3">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {selectedFoods.map((f) => (
              <button
                key={f.fdc_id}
                type="button"
                onClick={() => toggle(f)}
                className="shrink-0 flex items-center gap-1.5 bg-foreground text-background text-xs font-medium px-3 py-1.5 rounded-full"
              >
                <span className="max-w-[120px] truncate">{shortName(f.name)}</span>
                <span className="opacity-70 text-sm leading-none">×</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <main className="flex-1 max-w-xl mx-auto w-full px-5 pt-4 pb-32">
        {error && <div className="mb-4"><ErrorAlert message={error} onDismiss={() => setError(null)} /></div>}
        {searching && <Spinner message="Searching foods..." />}

        {!searching && searched && results.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-12">No results for "{query}". Try a simpler term.</p>
        )}

        {!searching && results.length === 0 && !query && (
          <div className="text-center py-12 space-y-2">
            <p className="text-4xl">🥦</p>
            <p className="text-sm text-muted-foreground">Search for foods above to get started.</p>
          </div>
        )}

        {/* Results grid */}
        <div className="grid grid-cols-2 gap-3">
          {results.map((f, i) => {
            const sel = isSelected(f);
            const label = DATA_TYPE_LABELS[f.data_type ?? ""] ?? f.data_type ?? "";
            const name = shortName(f.name);
            return (
              <button
                key={`${f.fdc_id}-${i}`}
                type="button"
                onClick={() => toggle(f)}
                className={`text-left border-2 p-3 flex flex-col gap-2 transition-colors relative
                  ${sel ? "border-foreground bg-foreground text-background" : "border-foreground bg-background text-foreground"}`}
              >
                {/* Score badge */}
                {typeof f.score === "number" && (
                  <span className={`absolute top-2 right-2 text-[11px] font-extrabold px-1.5 py-0.5 rounded ${sel ? "bg-background text-foreground" : scoreColor(f.score)}`}>
                    {Math.round(f.score)}
                  </span>
                )}

                {/* Checkmark */}
                {sel && (
                  <span className="absolute top-2 left-2 text-background text-sm leading-none">✓</span>
                )}

                {/* Name */}
                <p className={`text-sm font-semibold leading-snug line-clamp-2 mt-4 ${sel ? "text-background" : ""}`}>
                  {name}
                </p>

                {/* Tags */}
                <div className="flex flex-wrap gap-1">
                  {label && (
                    <span className={`text-[10px] px-1.5 py-0.5 font-medium uppercase tracking-wide
                      ${sel ? "bg-white/20 text-background" : "bg-surface-2 text-muted-foreground"}`}>
                      {label}
                    </span>
                  )}
                  {f.top_nutrients?.slice(0, 2).map((n) => (
                    <span key={n} className={`text-[10px] px-1.5 py-0.5
                      ${sel ? "bg-white/20 text-background" : "bg-surface text-muted-foreground"}`}>
                      {n}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </main>

      <footer className="fb-footer">
        <div className="max-w-xl mx-auto px-5 py-4 flex items-center gap-3">
          <button type="button" onClick={() => setScreen(2)} className="fb-btn-outline">Back</button>
          <button onClick={buildPlan} disabled={selectedFoods.length < 3} className="fb-btn flex-1">
            {selectedFoods.length < 3
              ? `Select ${needed} more`
              : `Build Plan (${selectedFoods.length})`}
          </button>
        </div>
      </footer>
    </div>
  );
};

export default FoodSearch;