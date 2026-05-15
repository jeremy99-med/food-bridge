import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Sex = "Male" | "Female";
export type Activity = "Sedentary" | "Lightly Active" | "Moderately Active" | "Very Active" | "Extra Active";
export type Smoking = "Smoker" | "Non-Smoker" | "Former Smoker";

export interface Profile {
  height: string;
  weight: string;
  age: string;
  sex: Sex | "";
  activity: Activity | "";
  goals: string[];
  conditions: string[];
  smoking: Smoking | "";
  medications: string[];
  adults: number;
  children: number;
}

export interface Preferences {
  budget: string;
  zip: string;
  diet: string[];
  allergies: string[];
  cuisines: string[];
  wic: boolean;
}

export interface FoodItem {
  fdc_id?: string | number;
  name: string;
  data_type?: string;
  score?: number;
  top_nutrients?: string[];
}

// 1-5 = main flow; 6 = Login; 7 = Signup; 8 = SavedLists; 9 = Profile
export type Screen = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface AuthUser {
  user_id: string;
  username: string;
}

interface AppState {
  screen: Screen;
  setScreen: (s: Screen) => void;

  onboardingStep: number;
  setOnboardingStep: (s: number) => void;

  profileId: string;
  setProfileId: (id: string) => void;

  profile: Profile;
  setProfile: (p: Partial<Profile>) => void;

  preferences: Preferences;
  setPreferences: (p: Partial<Preferences>) => void;

  selectedFoods: FoodItem[];
  setSelectedFoods: (f: FoodItem[]) => void;

  mealPlanResponse: string;
  groceryResponse: string;
  setResponse: (key: "mealPlan" | "grocery", text: string) => void;

  authToken: string | null;
  refreshToken: string | null;
  authUser: AuthUser | null;
  setAuth: (token: string, refreshToken: string, user: AuthUser) => void;
  setAccessToken: (token: string, refreshToken: string) => void;
  clearAuth: () => void;

  returnScreen: Screen | null;
  setReturnScreen: (s: Screen | null) => void;

  reset: () => void;
  logout: () => void;
}

const emptyProfile: Profile = {
  height: "", weight: "", age: "", sex: "", activity: "",
  goals: [], conditions: [], smoking: "", medications: [],
  adults: 1, children: 0,
};

const emptyPrefs: Preferences = {
  budget: "", zip: "", diet: [], allergies: [], cuisines: [], wic: false,
};

export const useApp = create<AppState>()(
  persist(
    (set) => ({
      screen: 1,
      setScreen: (s) => set({ screen: s }),

      onboardingStep: 1,
      setOnboardingStep: (s) => set({ onboardingStep: s }),

      profileId: "",
      setProfileId: (id) => set({ profileId: id }),

      profile: emptyProfile,
      setProfile: (p) => set((st) => ({ profile: { ...st.profile, ...p } })),

      preferences: emptyPrefs,
      setPreferences: (p) => set((st) => ({ preferences: { ...st.preferences, ...p } })),

      selectedFoods: [],
      setSelectedFoods: (f) => set({ selectedFoods: f }),

      mealPlanResponse: "",
      groceryResponse: "",
      setResponse: (key, text) => set(() => {
        const map = { mealPlan: "mealPlanResponse", grocery: "groceryResponse" } as const;
        return { [map[key]]: text } as Partial<AppState>;
      }),

      authToken: null,
      refreshToken: null,
      authUser: null,
      setAuth: (token, refresh, user) => set({ authToken: token, refreshToken: refresh, authUser: user }),
      setAccessToken: (token, refresh) => set({ authToken: token, refreshToken: refresh }),
      clearAuth: () => set({ authToken: null, refreshToken: null, authUser: null }),

      returnScreen: null,
      setReturnScreen: (s) => set({ returnScreen: s }),

      reset: () => set({
        screen: 1,
        onboardingStep: 1,
        profileId: "",
        profile: emptyProfile,
        preferences: emptyPrefs,
        selectedFoods: [],
        mealPlanResponse: "",
        groceryResponse: "",
        // intentionally does NOT clear auth — stay logged in on "Start Over"
      }),

      logout: () => set({
        screen: 1,
        onboardingStep: 1,
        profileId: "",
        profile: emptyProfile,
        preferences: emptyPrefs,
        selectedFoods: [],
        mealPlanResponse: "",
        groceryResponse: "",
        authToken: null,
        refreshToken: null,
        authUser: null,
      }),
    }),
    {
      name: "foodbridge-state",
      partialize: (s) => ({
        screen: s.screen,
        onboardingStep: s.onboardingStep,
        profileId: s.profileId,
        profile: s.profile,
        preferences: s.preferences,
        authToken: s.authToken,
        refreshToken: s.refreshToken,
        authUser: s.authUser,
      }),
    },
  ),
);