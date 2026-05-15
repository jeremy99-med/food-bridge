import type { Activity, Smoking } from "@/store/app";

export const ACTIVITY: Activity[] = ["Sedentary", "Lightly Active", "Moderately Active", "Very Active", "Extra Active"];
export const GOALS = ["Weight Loss", "Muscle Gain", "Weight Gain", "Maintenance"];
export const EXCLUSIVE_PAIRS = [["Weight Loss", "Weight Gain"]];
export const CONDITIONS = [
  "None",
  "Hypertension", "Type 2 Diabetes", "Type 1 Diabetes", "Heart Disease",
  "High Cholesterol", "Obesity", "Kidney Disease", "Celiac Disease",
  "Thyroid Disorder", "Anemia", "Osteoporosis", "GERD / Acid Reflux",
  "Irritable Bowel Syndrome", "Crohn's Disease", "Polycystic Ovary Syndrome",
  "Gestational Diabetes", "Prediabetes", "Liver Disease",
];
export const SMOKING: Smoking[] = ["Smoker", "Non-Smoker", "Former Smoker"];
export const MEDICATION_CATEGORIES: Record<string, string[]> = {
  "💊 Diabetes": ["Metformin", "Insulin", "Ozempic (Semaglutide)", "Jardiance", "Januvia"],
  "❤️ Heart / Blood Pressure": ["Lisinopril", "Amlodipine", "Metoprolol", "Atorvastatin", "Losartan", "Hydrochlorothiazide"],
  "🧠 Mental Health": ["Sertraline", "Escitalopram", "Fluoxetine", "Bupropion", "Quetiapine"],
  "🩺 Thyroid": ["Levothyroxine", "Methimazole"],
  "🦴 Bone Health": ["Calcium + Vitamin D", "Alendronate"],
  "🌿 Supplements": ["Iron Supplement", "Folate / Folic Acid", "Vitamin B12", "Vitamin D3", "Omega-3 / Fish Oil"],
  "💉 Blood Thinners": ["Warfarin", "Apixaban (Eliquis)", "Rivaroxaban (Xarelto)"],
  "🫁 Respiratory": ["Albuterol", "Fluticasone", "Montelukast"],
};

export function ftInToCm(ft: string, inches: string): string {
  return ((parseFloat(ft) * 12 + parseFloat(inches)) * 2.54).toFixed(1);
}
export function lbsToKg(lbs: string): string {
  return (parseFloat(lbs) * 0.453592).toFixed(1);
}
export function cmToFtIn(cm: string): { ft: string; inches: string } {
  const totalIn = parseFloat(cm) / 2.54;
  return { ft: String(Math.floor(totalIn / 12)), inches: String(Math.round(totalIn % 12)) };
}
export function kgToLbs(kg: string): string {
  return (parseFloat(kg) / 0.453592).toFixed(1);
}

export const isValidFloat = (v: string) => /^\d+(\.\d+)?$/.test(v.trim()) && parseFloat(v) > 0;
export const isValidAge = (v: string) => /^\d+$/.test(v.trim()) && parseInt(v) >= 1 && parseInt(v) <= 120;
export const isValidHeight = (v: string) => isValidFloat(v) && parseFloat(v) >= 50 && parseFloat(v) <= 300;
export const isValidWeight = (v: string) => isValidFloat(v) && parseFloat(v) >= 10 && parseFloat(v) <= 500;
