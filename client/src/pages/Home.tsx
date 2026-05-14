import React from "react";
import { useApp } from "@/store/app";
import Onboarding from "@/screens/Onboarding";
import Preferences from "@/screens/Preferences";
import FoodSearch from "@/screens/FoodSearch";
import MealPlan from "@/screens/MealPlan";
import GroceryList from "@/screens/GroceryList";
import Login from "@/screens/Login";
import Signup from "@/screens/Signup";
import SavedLists from "@/screens/SavedLists";

const SCREEN_LABELS = ["Health Profile", "Preferences", "Find Foods", "Meal Plan", "Grocery List"];

export default function Home() {
  const { screen, setScreen, setReturnScreen, authUser, logout } = useApp();

  const handleSignIn = () => {
    setReturnScreen(screen);
    setScreen(6);
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-[#daeade]">
        <div className="max-w-xl mx-auto px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🌿</span>
            <span
              className="text-[1.1rem] font-extrabold tracking-[-0.04em] text-[#0f4c2b]"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              FoodBridge
            </span>
          </div>

          {authUser ? (
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-[#4d7560] hidden sm:block">{authUser.username}</span>
              <button
                type="button"
                onClick={() => setScreen(8)}
                className="text-[11px] font-medium text-[#0f4c2b] underline underline-offset-2"
              >
                Saved
              </button>
              <button
                type="button"
                onClick={logout}
                className="text-[11px] font-medium text-[#4d7560] underline underline-offset-2"
              >
                Log out
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleSignIn}
              className="text-[11px] font-medium text-[#0f4c2b] underline underline-offset-2"
            >
              Sign in
            </button>
          )}
        </div>

        {screen <= 5 && (
          <div className="max-w-xl mx-auto px-5 pb-2.5">
            <div className="flex items-center gap-1.5">
              {SCREEN_LABELS.map((label, i) => {
                const active = screen === i + 1;
                const done = screen > i + 1;
                return (
                  <React.Fragment key={label}>
                    <div className="flex-1">
                      <div
                        className="h-[3px] rounded-full transition-all duration-500"
                        style={{
                          background: done ? "#0f4c2b" : active ? "#c9820a" : "#daeade",
                          transform: active ? "scaleY(1.6)" : "scaleY(1)",
                          transformOrigin: "bottom",
                        }}
                      />
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}
      </header>

      <main>
        <div key={screen} className="fb-page-enter">
          {screen === 1 && <Onboarding />}
          {screen === 2 && <Preferences />}
          {screen === 3 && <FoodSearch />}
          {screen === 4 && <MealPlan />}
          {screen === 5 && <GroceryList />}
          {screen === 6 && <Login />}
          {screen === 7 && <Signup />}
          {screen === 8 && <SavedLists />}
        </div>
      </main>
    </div>
  );
}
