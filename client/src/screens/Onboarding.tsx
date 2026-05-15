import { useState } from "react";
import { useApp, type Sex } from "@/store/app";
import { createProfile } from "@/lib/api";
import ProgressBar from "@/components/ProgressBar";
import PillGroup from "@/components/PillGroup";
import Stepper from "@/components/Stepper";
import Spinner from "@/components/Spinner";
import ErrorAlert from "@/components/ErrorAlert";
import {
  ACTIVITY, GOALS, CONDITIONS, SMOKING, MEDICATION_CATEGORIES,
  isValidAge, isValidHeight, isValidWeight,
} from "@/lib/profileUtils";
import Field from "@/components/ProfileField";
import { useProfileForm } from "@/hooks/useProfileForm";

const STEPS = 6;

const Onboarding = () => {
  const { profile, setProfile, setScreen, setProfileId, onboardingStep: step, setOnboardingStep: setStep } = useApp();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const { unitSystem, heightFt, setHeightFt, heightIn, setHeightIn, weightLbs, setWeightLbs, handleUnitToggle, handleGoalChange, handleConditionChange, toggleMedication } = useProfileForm();

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
      <header className="px-5 pt-4 pb-3 max-w-xl mx-auto w-full" style={{ background: 'var(--color-background)' }}>
        <ProgressBar current={step} total={STEPS} />
      </header>

      <main className="flex-1 px-5 max-w-xl mx-auto w-full pb-24">
        {error && <div className="mb-4"><ErrorAlert message={error} onDismiss={() => setError(null)} /></div>}

        <div key={step} className="fb-step-fade">
        {/* Step 1 — Measurements */}
        {step === 1 && (
          <section className="space-y-5">
            <h1 className="text-[2.2rem] fb-display">📏 About you</h1>
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
          <section className="space-y-5">
            <h1 className="text-[2.2rem] fb-display">🏃 Activity level</h1>
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
            <h1 className="text-[2.2rem] fb-display">🎯 Health goals</h1>
            <p className="text-sm text-muted-foreground">Select one goal.</p>
            <div className="flex flex-col gap-2">
              {GOALS.map((g) => (
                <button key={g} type="button" onClick={() => setProfile({ goals: [g] })}
                  className={`h-12 border-2 border-foreground rounded-lg text-sm font-medium px-4 text-left transition-colors
                    ${profile.goals.includes(g) ? "bg-foreground text-white" : "bg-white text-foreground"}`}>
                  {g}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Step 4 — Conditions */}
        {step === 4 && (
          <section className="space-y-4">
            <h1 className="text-[2.2rem] fb-display">🩺 Health conditions</h1>
            <p className="text-sm text-muted-foreground">Select all that apply. Selecting "None" will clear all others.</p>
            <PillGroup options={CONDITIONS} selected={profile.conditions} onChange={handleConditionChange} />
          </section>
        )}

        {/* Step 5 — Lifestyle + Medications */}
        {step === 5 && (
          <section className="space-y-5">
            <h1 className="text-[2.2rem] fb-display">🌿 Lifestyle</h1>
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
              <span className="fb-section-title block">Medications <span className="text-muted-foreground normal-case font-normal">(optional)</span></span>
              {profile.medications.length > 0 && (
                <p className="text-xs text-muted-foreground">Selected: {profile.medications.join(", ")}</p>
              )}
              <div className="space-y-4">
                {Object.entries(MEDICATION_CATEGORIES).map(([category, meds]) => (
                  <div key={category} className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{category}</p>
                    <div className="flex flex-wrap gap-2 justify-center">
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
          <section className="space-y-5">
            <h1 className="text-[2.2rem] fb-display">🏠 Household</h1>
            <p className="text-sm text-muted-foreground -mt-4">Who are we planning meals for?</p>
            <div className="space-y-3">
              <Stepper label="Adults" value={profile.adults} onChange={(n) => setProfile({ adults: n })} min={1} max={20} />
              <Stepper label="Children" value={profile.children} onChange={(n) => setProfile({ children: n })} min={0} max={20} />
            </div>
          </section>
        )}
        </div>
      </main>

      <footer className="fb-footer">
        <div className="max-w-xl mx-auto px-5 py-3 flex items-center justify-between gap-3">
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

export default Onboarding;
