import { useState } from "react";
import { useApp } from "@/store/app";
import { savePreferences } from "@/lib/api";
import PillGroup from "@/components/PillGroup";
import Spinner from "@/components/Spinner";
import ErrorAlert from "@/components/ErrorAlert";

const DIETS = ["Vegetarian", "Vegan", "Gluten Free", "Dairy Free", "Nut Free", "Low Sodium", "Low Carb", "Keto", "Halal", "Kosher"];
const ALLERGIES = ["Peanuts", "Shellfish", "Dairy", "Eggs", "Wheat", "Soy", "Tree Nuts", "Fish"];
const CUISINES = ["Mediterranean", "Asian", "Mexican", "American", "Italian", "Middle Eastern"];

const isValidBudget = (v: string) => /^\d+(\.\d{0,2})?$/.test(v.trim()) && parseFloat(v) > 0;
const isValidZip = (v: string) => /^\d{5}$/.test(v.trim());

const Preferences = () => {
  const { preferences, setPreferences, setScreen, profileId } = useApp();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!preferences.budget) errs.budget = "Required";
    else if (!isValidBudget(preferences.budget)) errs.budget = "Enter a valid amount (e.g. 150)";
    if (!preferences.zip) errs.zip = "Required";
    else if (!isValidZip(preferences.zip)) errs.zip = "Must be exactly 5 digits";
    return errs;
  };

  const submit = async () => {
    const errs = validate();
    if (Object.keys(errs).length) { setFieldErrors(errs); return; }
    setFieldErrors({});
    setError(null);
    setLoading(true);
    try {
      await savePreferences({
        profile_id: profileId,
        weekly_budget_usd: parseFloat(preferences.budget),
        zip_code: preferences.zip,
        dietary_preferences: preferences.diet,
        allergies: preferences.allergies,
        cuisine_preferences: preferences.cuisines,
        wic_filter_active: preferences.wic,
      });
      setScreen(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Spinner message="Saving your preferences..." /></div>;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-5 pt-5 pb-3 max-w-xl mx-auto w-full" style={{background : 'var(--color-background)'}}>
        <p className="fb-section-title">Step 2 of 5</p>
        <h1 className="text-[2.5rem] fb-display leading-none mt-1">Preferences</h1>
        <p className="text-sm text-[#4d7560] mt-1">Budget, location, and what you like to eat.</p>
      </header>

      <main className="flex-1 max-w-xl mx-auto w-full px-5 pb-24 space-y-6">
        {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

        <Section title="💰 Budget & location">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <span className="fb-section-title block">Weekly budget ($)</span>
              <input
                className={`fb-input ${fieldErrors.budget ? "border-red-500" : ""}`}
                type="number"
                inputMode="numeric"
                min={0}
                placeholder="150"
                value={preferences.budget}
                onChange={(e) => {
                  setPreferences({ budget: e.target.value });
                  if (fieldErrors.budget) setFieldErrors((f) => ({ ...f, budget: "" }));
                }}
              />
              {fieldErrors.budget && <p className="text-xs text-red-500">⚠ {fieldErrors.budget}</p>}
            </div>

            <div className="space-y-1">
              <span className="fb-section-title block">Zip code</span>
              <input
                className={`fb-input ${fieldErrors.zip ? "border-red-500" : ""}`}
                inputMode="numeric"
                maxLength={5}
                placeholder="10001"
                value={preferences.zip}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "").slice(0, 5);
                  setPreferences({ zip: val });
                  if (fieldErrors.zip) setFieldErrors((f) => ({ ...f, zip: "" }));
                }}
              />
              {fieldErrors.zip && <p className="text-xs text-red-500">⚠ {fieldErrors.zip}</p>}
            </div>
          </div>
        </Section>

        <Section title="🥗 Dietary preferences">
          <PillGroup center options={DIETS} selected={preferences.diet} onChange={(v) => setPreferences({ diet: v })} />
        </Section>

        <Section title="⚠️ Allergies">
          <PillGroup center options={ALLERGIES} selected={preferences.allergies} onChange={(v) => setPreferences({ allergies: v })} />
        </Section>

        <Section title="🌍 Cuisine preferences">
          <PillGroup center options={CUISINES} selected={preferences.cuisines} onChange={(v) => setPreferences({ cuisines: v })} />
        </Section>

        <Section title="WIC eligibility">
          <button type="button" onClick={() => setPreferences({ wic: !preferences.wic })}
            className="w-full h-14 border-2 border-foreground rounded-lg flex items-center justify-between px-4 hover:bg-surface transition-colors duration-150">
            <span className="text-sm text-left">Pregnant, infant, or child in household?</span>
            <span className={`w-12 h-7 border-2 border-foreground rounded-full relative transition-colors duration-200 ${preferences.wic ? "bg-foreground" : "bg-white"}`}>
              <span className={`absolute top-0.5 ${preferences.wic ? "right-0.5 bg-white" : "left-0.5 bg-foreground"} w-5 h-5 rounded-full transition-all duration-200 [transition-timing-function:cubic-bezier(0.4,0,0.2,1)]`} />
            </span>
          </button>
        </Section>
      </main>

      <footer className="fb-footer">
        <div className="max-w-xl mx-auto px-5 py-3 flex items-center gap-3">
          <button type="button" onClick={() => setScreen(1)} className="fb-btn-outline">Back</button>
          <button onClick={submit} className="fb-btn flex-1">Continue</button>
        </div>
      </footer>
    </div>
  );
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-3">
    <h2 className="fb-section-title">{title}</h2>
    {children}
  </section>
);

export default Preferences;
