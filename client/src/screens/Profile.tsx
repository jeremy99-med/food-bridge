import { useState } from "react";
import { useApp, type Sex } from "@/store/app";
import { createProfile } from "@/lib/api";
import PillGroup from "@/components/PillGroup";
import Stepper from "@/components/Stepper";
import Spinner from "@/components/Spinner";
import ErrorAlert from "@/components/ErrorAlert";
import Field from "@/components/ProfileField";
import { useProfileForm } from "@/hooks/useProfileForm";
import {
  ACTIVITY, GOALS, CONDITIONS, SMOKING, MEDICATION_CATEGORIES,
  ftInToCm, lbsToKg,
  isValidAge, isValidHeight, isValidWeight,
} from "@/lib/profileUtils";

const Profile = () => {
  const { profile, setProfile, setScreen, setProfileId } = useApp();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const { unitSystem, heightFt, setHeightFt, heightIn, setHeightIn, weightLbs, setWeightLbs, handleUnitToggle, handleGoalChange, handleConditionChange, toggleMedication } = useProfileForm();

  const validate = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (!profile.height) errs.height = "Required";
    else if (!isValidHeight(profile.height)) errs.height = "Enter a valid height";
    if (!profile.weight) errs.weight = "Required";
    else if (!isValidWeight(profile.weight)) errs.weight = "Enter a valid weight";
    if (!profile.age) errs.age = "Required";
    else if (!isValidAge(profile.age)) errs.age = "Enter a valid age (1–120)";
    if (!profile.sex) errs.sex = "Please select a sex";
    return errs;
  };

  const submit = async () => {
    const errs = validate();
    if (Object.keys(errs).length) { setFieldErrors(errs); return; }
    setFieldErrors({});
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
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const canSave =
    !!profile.height && isValidHeight(profile.height) &&
    !!profile.weight && isValidWeight(profile.weight) &&
    !!profile.age && isValidAge(profile.age) &&
    !!profile.sex && !!profile.activity &&
    profile.goals.length > 0 && profile.conditions.length > 0 && !!profile.smoking;

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Spinner message="Saving your profile..." /></div>;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-5 pt-5 pb-3 max-w-xl mx-auto w-full" style={{ background: 'var(--color-background)' }}>
        <h1 className="text-[2.5rem] fb-display leading-none mt-1">Health Profile</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-muted-foreground)' }}>Update your information to keep recommendations accurate.</p>
      </header>

      <main className="flex-1 max-w-xl mx-auto w-full px-5 pb-24 space-y-8">
        {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}
        {success && (
          <div className="rounded-lg px-4 py-3 text-sm font-medium" style={{ background: 'var(--color-surface)', color: 'var(--color-foreground)', border: '1px solid var(--color-border)' }}>
            Profile saved successfully.
          </div>
        )}

        {/* Section 1 — About you */}
        <section className="space-y-4">
          <h2 className="fb-section-title">📏 About you</h2>

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

        {/* Section 2 — Activity level */}
        <section className="space-y-3">
          <h2 className="fb-section-title">🏃 Activity level</h2>
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

        {/* Section 3 — Health goals */}
        <section className="space-y-3">
          <h2 className="fb-section-title">🎯 Health goals</h2>
          <div className="flex flex-col gap-2">
            {GOALS.map((g) => (
              <button key={g} type="button" onClick={() => handleGoalChange(
                profile.goals.includes(g) ? profile.goals.filter((x) => x !== g) : [...profile.goals, g]
              )}
                className={`h-12 border-2 border-foreground rounded-lg text-sm font-medium px-4 text-left transition-colors
                  ${profile.goals.includes(g) ? "bg-foreground text-white" : "bg-white text-foreground"}`}>
                {g}
              </button>
            ))}
          </div>
        </section>

        {/* Section 4 — Health conditions */}
        <section className="space-y-3">
          <h2 className="fb-section-title">🩺 Health conditions</h2>
          <p className="text-sm" style={{ color: 'var(--color-muted-foreground)' }}>Select all that apply. Selecting "None" will clear all others.</p>
          <PillGroup options={CONDITIONS} selected={profile.conditions} onChange={handleConditionChange} />
        </section>

        {/* Section 5 — Lifestyle */}
        <section className="space-y-4">
          <h2 className="fb-section-title">🌿 Lifestyle</h2>
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
            <span className="fb-section-title block">Medications <span className="normal-case font-normal" style={{ color: 'var(--color-muted-foreground)' }}>(optional)</span></span>
            {profile.medications.length > 0 && (
              <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>Selected: {profile.medications.join(", ")}</p>
            )}
            <div className="space-y-4">
              {Object.entries(MEDICATION_CATEGORIES).map(([category, meds]) => (
                <div key={category} className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-muted-foreground)' }}>{category}</p>
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

        {/* Section 6 — Household */}
        <section className="space-y-3">
          <h2 className="fb-section-title">🏠 Household</h2>
          <p className="text-sm" style={{ color: 'var(--color-muted-foreground)' }}>Who are we planning meals for?</p>
          <div className="space-y-3">
            <Stepper label="Adults" value={profile.adults} onChange={(n) => setProfile({ adults: n })} min={1} max={20} />
            <Stepper label="Children" value={profile.children} onChange={(n) => setProfile({ children: n })} min={0} max={20} />
          </div>
        </section>
      </main>

      <footer className="fb-footer">
        <div className="max-w-xl mx-auto px-5 py-3 flex items-center gap-3">
          <button type="button" onClick={() => setScreen(2)} className="fb-btn-outline">Back</button>
          <button type="button" onClick={submit} disabled={!canSave || loading} className="fb-btn flex-1">Save changes</button>
        </div>
      </footer>
    </div>
  );
};

export default Profile;
