import { useState } from "react";
import { useApp } from "@/store/app";
import { EXCLUSIVE_PAIRS, cmToFtIn, kgToLbs } from "@/lib/profileUtils";

export function useProfileForm() {
  const { profile, setProfile } = useApp();
  const [unitSystem, setUnitSystem] = useState<'imperial' | 'metric'>('imperial');
  const [heightFt, setHeightFt] = useState(() => profile.height ? cmToFtIn(profile.height).ft : '');
  const [heightIn, setHeightIn] = useState(() => profile.height ? cmToFtIn(profile.height).inches : '');
  const [weightLbs, setWeightLbs] = useState(() => profile.weight ? kgToLbs(profile.weight) : '');

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
    const justAddedNone = selected.includes("None") && !profile.conditions.includes("None");
    if (justAddedNone) { setProfile({ conditions: ["None"] }); return; }
    setProfile({ conditions: selected.filter((c) => c !== "None") });
  };

  const toggleMedication = (med: string) => {
    const current = profile.medications;
    const next = current.includes(med) ? current.filter((m) => m !== med) : [...current, med];
    setProfile({ medications: next });
  };

  return {
    unitSystem, setUnitSystem,
    heightFt, setHeightFt,
    heightIn, setHeightIn,
    weightLbs, setWeightLbs,
    handleUnitToggle, handleGoalChange, handleConditionChange, toggleMedication,
  };
}
