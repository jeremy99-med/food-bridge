import { useState } from "react";
import { useApp, type Sex, type Activity, type Smoking } from "@/store/app";
import { createProfile } from "@/lib/api";
import ProgressBar from "@/components/ProgressBar";
import PillGroup from "@/components/PillGroup";
import Stepper from "@/components/Stepper";
import Spinner from "@/components/Spinner";
import ErrorAlert from "@/components/ErrorAlert";

const ACTIVITY: Activity[] = ["Sedentary", "Lightly Active", "Moderately Active", "Very Active", "Extra Active"];

const GOALS = ["Weight Loss", "Muscle Gain", "Weight Gain", "Maintenance"];
// Weight Loss and Weight Gain are mutually exclusive
const EXCLUSIVE_PAIRS = [["Weight Loss", "Weight Gain"]];

const CONDITIONS = [
  "None",
  "Hypertension", "Type 2 Diabetes", "Type 1 Diabetes", "Heart Disease",
  "High Cholesterol", "Obesity", "Kidney Disease", "Celiac Disease",
  "Thyroid Disorder", "Anemia", "Osteoporosis", "GERD / Acid Reflux",
  "Irritable Bowel Syndrome", "Crohn's Disease", "Polycystic Ovary Syndrome",
  "Gestational Diabetes", "Prediabetes", "Liver Disease",
];

const SMOKING: Smoking[] = ["Smoker", "Non-Smoker", "Former Smoker"];

// Medications by category
const MEDICATION_CATEGORIES: Record<string, string[]> = {
  "💊 Diabetes": ["Metformin", "Insulin", "Ozempic (Semaglutide)", "Jardiance", "Januvia"],
  "❤️ Heart / Blood Pressure": ["Lisinopril", "Amlodipine", "Metoprolol", "Atorvastatin", "Losartan", "Hydrochlorothiazide"],
  "🧠 Mental Health": ["Sertraline", "Escitalopram", "Fluoxetine", "Bupropion", "Quetiapine"],
  "🩺 Thyroid": ["Levothyroxine", "Methimazole"],
  "🦴 Bone Health": ["Calcium + Vitamin D", "Alendronate"],
  "🌿 Supplements": ["Iron Supplement", "Folate / Folic Acid", "Vitamin B12", "Vitamin D3", "Omega-3 / Fish Oil"],
  "💉 Blood Thinners": ["Warfarin", "Apixaban (Eliquis)", "Rivaroxaban (Xarelto)"],
  "🫁 Respiratory": ["Albuterol", "Fluticasone", "Montelukast"],
};

const STEPS = 6;

// Unit conversion helpers (imperial ↔ metric)
function ftInToCm(ft: string, inches: string): string {
  return ((parseFloat(ft) * 12 + parseFloat(inches)) * 2.54).toFixed(1);
}
function lbsToKg(lbs: string): string {
  return (parseFloat(lbs) * 0.453592).toFixed(1);
}
function cmToFtIn(cm: string): { ft: string; inches: string } {
  const totalIn = parseFloat(cm) / 2.54;
  return { ft: String(Math.floor(totalIn / 12)), inches: String(Math.round(totalIn % 12)) };
}
function kgToLbs(kg: string): string {
  return (parseFloat(kg) / 0.453592).toFixed(1);
}

// Validation helpers
const isValidFloat = (v: string) => /^\d+(\.\d+)?$/.test(v.trim()) && parseFloat(v) > 0;
const isValidAge = (v: string) => /^\d+$/.test(v.trim()) && parseInt(v) >= 1 && parseInt(v) <= 120;
const isValidHeight = (v: string) => isValidFloat(v) && parseFloat(v) >= 50 && parseFloat(v) <= 300;
const isValidWeight = (v: string) => isValidFloat(v) && parseFloat(v) >= 10 && parseFloat(v) <= 500;

const Onboarding = () => {
  const { profile, setProfile, setScreen, setProfileId, onboardingStep: step, setOnboardingStep: setStep } = useApp();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [unitSystem, setUnitSystem] = useState<'imperial' | 'metric'>('imperial');
  const [heightFt, setHeightFt] = useState(() => profile.height ? cmToFtIn(profile.height).ft : '');
  const [heightIn, setHeightIn] = useState(() => profile.height ? cmToFtIn(profile.height).inches : '');
  const [weightLbs, setWeightLbs] = useState(() => profile.weight ? kgToLbs(profile.weight) : '');

  const next = () => {
    const errs = validateStep(step);
    if (Object.keys(errs).length) { setFieldErrors(errs); return; }
    setFieldErrors({});
    setStep(Math.min(STEPS, step + 1));
  };
  const back = () => { setFieldErrors({}); setStep(Math.max(1, step - 1)); };

  const validateStep = (s: number): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (s === 1) {
      if (!profile.height) errs.height = "Required";
      else if (!isValidHeight(profile.height)) errs.height = "Enter a valid height";
      if (!profile.weight) errs.weight = "Required";
      else if (!isValidWeight(profile.weight)) errs.weight = "Enter a valid weight";
      if (!profile.age) errs.age = "Required";
      else if (!isValidAge(profile.age)) errs.age = "Enter a valid age (1–120)";
      if (!profile.sex) errs.sex = "Please select a sex";
    }
    return errs;
  };

  const handleUnitToggle = (system: 'imperial' | 'metric') => {
    if (system === 'imperial') {
      if (profile.height) {
        const { ft, inches } = cmToFtIn(profile.height);
        setHeightFt(ft);
        setHeightIn(inches);
      }
      if (profile.weight) setWeightLbs(kgToLbs(profile.weight));
    }
    setUnitSystem(system);
  };

  const handleGoalChange = (selected: string[]) => {
    let next = selected;
    for (const [a, b] of EXCLUSIVE_PAIRS) {
      const hadA = profile.goals.includes(a);
      const hadB = profile.goals.includes(b);
      const hasA = selected.includes(a);
      const hasB = selected.includes(b);
      if (!hadA && hasA && hasB) next = next.filter((g) => g !== b);
      if (!hadB && hasB && hasA) next = next.filter((g) => g !== a);
    }
    setProfile({ goals: next });
  };

  const handleConditionChange = (selected: string[]) => {
    // If "None" was just added, clear everything else
    const justAddedNone = selected.includes("None") && !profile.conditions.includes("None");
    if (justAddedNone) { setProfile({ conditions: ["None"] }); return; }
    // If something else was added while "None" was selected, remove "None"
    setProfile({ conditions: selected.filter((c) => c !== "None") });
  };

  const toggleMedication = (med: string) => {
    const current = profile.medications;
    const next = current.includes(med) ? current.filter((m) => m !== med) : [...current, med];
    setProfile({ medications: next });
  };

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await createProfile({
        height_cm: parseFloat(profile.height),
        weight_kg: parseFloat(profile.weight),
        age: parseInt(profile.age),
        sex: profile.sex,
        activity_level: profile.activity,
        smoking_status: profile.smoking,
        household_size_adults: profile.adults,
        household_size_children: profile.children,
        health_goals: profile.goals.filter((g) => g !== "None"),
        health_conditions: profile.conditions.filter((c) => c !== "None"),
        medications: profile.medications,
      });
      setProfileId(result.profile_id);
      setScreen(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Spinner message="Saving your profile..." /></div>;
  }

  const canContinue = (() => {
    switch (step) {
      case 1: return profile.height && profile.weight && profile.age && profile.sex &&
        isValidHeight(profile.height) && isValidWeight(profile.weight) && isValidAge(profile.age);
      case 2: return !!profile.activity;
      case 3: return profile.goals.length > 0;
      case 4: return profile.conditions.length > 0;
      case 5: return !!profile.smoking;
      case 6: return true;
      default: return false;
    }
  })();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-5 pt-6 pb-4 max-w-xl mx-auto w-full">
        <ProgressBar current={step} total={STEPS} />
      </header>

      <main className="flex-1 px-5 max-w-xl mx-auto w-full pb-32">
        {error && <div className="mb-4"><ErrorAlert message={error} onDismiss={() => setError(null)} /></div>}

        {/* Step 1 — Measurements */}
        {step === 1 && (
          <section className="space-y-6">
            <h1 className="text-3xl font-bold">📏 About you</h1>
            <p className="text-sm text-muted-foreground -mt-4">Basic measurements help us personalize your nutrition.</p>

            {/* Unit system toggle */}
            <div className="grid grid-cols-2 border-2 border-foreground h-10 rounded-lg overflow-hidden">
              {(['Imperial', 'Metric'] as const).map((u) => (
                <button key={u} type="button"
                  onClick={() => handleUnitToggle(u.toLowerCase() as 'imperial' | 'metric')}
                  className={`text-sm font-medium transition-colors ${unitSystem === u.toLowerCase() ? "bg-foreground text-white" : "bg-white text-foreground"}`}>
                  {u}
                </button>
              ))}
            </div>

            {unitSystem === 'imperial' ? (
              <div className="grid grid-cols-2 gap-3">
                {/* Imperial height — ft + in inputs spanning full width */}
                <div className="col-span-2">
                  <label className="block space-y-2">
                    <span className="fb-section-title block">Height</span>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="relative">
                        <input
                          className={`fb-input pr-10 ${fieldErrors.height ? "border-red-500" : ""}`}
                          type="number" inputMode="numeric" placeholder="5"
                          min={1} max={8}
                          value={heightFt}
                          onChange={(e) => {
                            const ft = e.target.value;
                            setHeightFt(ft);
                            setProfile({ height: ft && heightIn !== '' ? ftInToCm(ft, heightIn) : '' });
                          }} />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">ft</span>
                      </div>
                      <div className="relative">
                        <input
                          className={`fb-input pr-10 ${fieldErrors.height ? "border-red-500" : ""}`}
                          type="number" inputMode="numeric" placeholder="10"
                          min={0} max={11}
                          value={heightIn}
                          onChange={(e) => {
                            const inches = e.target.value;
                            setHeightIn(inches);
                            setProfile({ height: heightFt && inches !== '' ? ftInToCm(heightFt, inches) : '' });
                          }} />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">in</span>
                      </div>
                    </div>
                    {fieldErrors.height && <p className="text-xs text-red-500 mt-1">⚠ {fieldErrors.height}</p>}
                  </label>
                </div>

                {/* Imperial weight */}
                <Field label="Weight" error={fieldErrors.weight}>
                  <div className="relative">
                    <input
                      className={`fb-input pr-12 ${fieldErrors.weight ? "border-red-500" : ""}`}
                      type="number" inputMode="numeric" placeholder="150"
                      min={22} max={1100}
                      value={weightLbs}
                      onChange={(e) => {
                        const lbs = e.target.value;
                        setWeightLbs(lbs);
                        setProfile({ weight: lbs ? lbsToKg(lbs) : '' });
                      }} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">lbs</span>
                  </div>
                </Field>

                <Field label="Age" error={fieldErrors.age}>
                  <input className={`fb-input ${fieldErrors.age ? "border-red-500" : ""}`}
                    type="number" inputMode="numeric" placeholder="30"
                    min={1} max={120}
                    value={profile.age} onChange={(e) => setProfile({ age: e.target.value })} />
                </Field>

                <Field label="Sex" error={fieldErrors.sex} className="col-span-2">
                  <div className="grid grid-cols-2 border-2 border-foreground h-12 rounded-lg overflow-hidden">
                    {(["Male", "Female"] as Sex[]).map((s) => (
                      <button key={s} type="button" onClick={() => setProfile({ sex: s })}
                        className={`text-sm font-medium transition-colors ${profile.sex === s ? "bg-foreground text-white" : "bg-white text-foreground"}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Height (cm)" error={fieldErrors.height} className="col-span-2">
                  <div className="relative">
                    <input className={`fb-input pr-10 ${fieldErrors.height ? "border-red-500" : ""}`}
                      type="number" inputMode="numeric" placeholder="175"
                      min={50} max={300}
                      value={profile.height} onChange={(e) => setProfile({ height: e.target.value })} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">cm</span>
                  </div>
                </Field>
                <Field label="Weight (kg)" error={fieldErrors.weight}>
                  <div className="relative">
                    <input className={`fb-input pr-10 ${fieldErrors.weight ? "border-red-500" : ""}`}
                      type="number" inputMode="numeric" placeholder="70"
                      min={10} max={500}
                      value={profile.weight} onChange={(e) => setProfile({ weight: e.target.value })} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">kg</span>
                  </div>
                </Field>
                <Field label="Age" error={fieldErrors.age}>
                  <input className={`fb-input ${fieldErrors.age ? "border-red-500" : ""}`}
                    type="number" inputMode="numeric" placeholder="30"
                    min={1} max={120}
                    value={profile.age} onChange={(e) => setProfile({ age: e.target.value })} />
                </Field>
                <Field label="Sex" error={fieldErrors.sex} className="col-span-2">
                  <div className="grid grid-cols-2 border-2 border-foreground h-12 rounded-lg overflow-hidden">
                    {(["Male", "Female"] as Sex[]).map((s) => (
                      <button key={s} type="button" onClick={() => setProfile({ sex: s })}
                        className={`text-sm font-medium transition-colors ${profile.sex === s ? "bg-foreground text-white" : "bg-white text-foreground"}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>
            )}
          </section>
        )}

        {/* Step 2 — Activity */}
        {step === 2 && (
          <section className="space-y-6">
            <h1 className="text-3xl font-bold">🏃 Activity level</h1>
            <p className="text-sm text-muted-foreground -mt-4">How active are you on a typical week?</p>
            <div className="flex flex-col gap-2">
              {ACTIVITY.map((a) => (
                <button key={a} type="button" onClick={() => setProfile({ activity: a })}
                  className={`h-12 border-2 border-foreground rounded-lg text-sm font-medium px-4 text-left transition-colors
                    ${profile.activity === a ? "bg-foreground text-white" : "bg-white text-foreground"}`}>
                  {a}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Step 3 — Goals */}
        {step === 3 && (
          <section className="space-y-4">
            <h1 className="text-3xl font-bold">🎯 Health goals</h1>
            <p className="text-sm text-muted-foreground">Select one goal.</p>
            <PillGroup options={GOALS} selected={profile.goals} onChange={(v) => setProfile({ goals: v })} multi={false} />
          </section>
        )}

        {/* Step 4 — Conditions */}
        {step === 4 && (
          <section className="space-y-4">
            <h1 className="text-3xl font-bold">🩺 Health conditions</h1>
            <p className="text-sm text-muted-foreground">Select all that apply. Selecting "None" will clear all others.</p>
            <PillGroup options={CONDITIONS} selected={profile.conditions} onChange={handleConditionChange} />
          </section>
        )}

        {/* Step 5 — Lifestyle + Medications */}
        {step === 5 && (
          <section className="space-y-6">
            <h1 className="text-3xl font-bold">🌿 Lifestyle</h1>
            <Field label="Smoking status">
              <div className="grid grid-cols-3 border-2 border-foreground h-12 rounded-lg overflow-hidden">
                {SMOKING.map((s) => (
                  <button key={s} type="button" onClick={() => setProfile({ smoking: s })}
                    className={`text-xs sm:text-sm font-medium transition-colors ${profile.smoking === s ? "bg-foreground text-white" : "bg-white text-foreground"}`}>
                    {s}
                  </button>
                ))}
              </div>
            </Field>

            <div className="space-y-3">
              <span className="fb-section-title block">💊 Medications <span className="text-muted-foreground normal-case font-normal">(optional)</span></span>
              {profile.medications.length > 0 && (
                <p className="text-xs text-muted-foreground">Selected: {profile.medications.join(", ")}</p>
              )}
              <div className="space-y-4">
                {Object.entries(MEDICATION_CATEGORIES).map(([category, meds]) => (
                  <div key={category} className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{category}</p>
                    <div className="flex flex-wrap gap-2">
                      {meds.map((med) => (
                        <button key={med} type="button"
                          className="fb-pill"
                          data-active={profile.medications.includes(med)}
                          onClick={() => toggleMedication(med)}>
                          {med}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Step 6 — Household */}
        {step === 6 && (
          <section className="space-y-6">
            <h1 className="text-3xl font-bold">🏠 Household</h1>
            <p className="text-sm text-muted-foreground -mt-4">Who are we planning meals for?</p>
            <div className="space-y-3">
              <Stepper label="Adults" value={profile.adults} onChange={(n) => setProfile({ adults: n })} min={1} max={20} />
              <Stepper label="Children" value={profile.children} onChange={(n) => setProfile({ children: n })} min={0} max={20} />
            </div>
          </section>
        )}
      </main>

      <footer className="fixed bottom-0 left-0 right-0 bg-background border-t border-foreground">
        <div className="max-w-xl mx-auto px-5 py-4 flex items-center justify-between gap-3">
          <button type="button" onClick={back} disabled={step === 1} className="fb-btn-outline">Back</button>
          {step < STEPS ? (
            <button type="button" onClick={next} disabled={!canContinue} className="fb-btn flex-1">Continue</button>
          ) : (
            <button type="button" onClick={submit} disabled={!canContinue} className="fb-btn flex-1">Finish profile</button>
          )}
        </div>
      </footer>
    </div>
  );
};

const Field = ({ label, error, className, children }: { label: string; error?: string; className?: string; children: React.ReactNode }) => (
  <label className={`block space-y-2 ${className ?? ''}`}>
    <span className="fb-section-title block">{label}</span>
    {children}
    {error && <p className="text-xs text-red-500 mt-1">⚠ {error}</p>}
  </label>
);

export default Onboarding;
