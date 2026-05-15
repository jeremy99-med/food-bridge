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
import Profile from "@/screens/Profile";
import { useDarkMode } from "@/hooks/useDarkMode";
import { DarkModeToggle } from "@/components/DarkModeToggle";

const SCREEN_LABELS = ["Health Profile", "Preferences", "Find Foods", "Meal Plan", "Grocery List"];

export default function Home() {
  const { screen, setScreen, setReturnScreen, authUser, profileId, logout } = useApp();
  const [dark, setDark] = useDarkMode();

  // Skip onboarding if user is already logged in with a complete profile
  React.useEffect(() => {
    if (authUser && profileId && screen === 1) setScreen(2);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSignIn = () => {
    setReturnScreen(screen);
    setScreen(6);
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-[#daeade]">
        <div className="max-w-xl mx-auto px-5 py-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setScreen(authUser && profileId ? 2 : 1)}
            className="flex items-center gap-2 cursor-pointer"
            aria-label="Go to home"
          >
            <span className="text-xl">🌿</span>
            <span
              className="text-[1.1rem] font-extrabold tracking-[-0.04em]"
              style={{ fontFamily: "'Playfair Display', serif", color: 'var(--color-foreground)' }}
            >
              FoodBridge
            </span>
          </button>

          <div className="flex items-center gap-3">
            {authUser ? (
              <>
                <span className="text-[11px] hidden sm:block" style={{ color: 'var(--color-muted-foreground)' }}>{authUser.username}</span>
                {profileId && (
                  <button
                    type="button"
                    onClick={() => setScreen(9)}
                    className="text-[11px] font-medium underline underline-offset-2"
                    style={{ color: 'var(--color-foreground)' }}
                  >
                    Profile
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setScreen(8)}
                  className="text-[11px] font-medium underline underline-offset-2"
                  style={{ color: 'var(--color-foreground)' }}
                >
                  Saved
                </button>
                <button
                  type="button"
                  onClick={logout}
                  className="text-[11px] font-medium underline underline-offset-2"
                  style={{ color: 'var(--color-muted-foreground)' }}
                >
                  Log out
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleSignIn}
                className="text-[11px] font-medium underline underline-offset-2"
                style={{ color: 'var(--color-foreground)' }}
              >
                Sign in
              </button>
            )}
            <DarkModeToggle dark={dark} onToggle={() => setDark(!dark)} />
          </div>
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
                          background: done ? "var(--color-foreground)" : active ? "var(--color-gold)" : "var(--color-track)",
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
          {screen === 9 && <Profile />}
        </div>
      </main>
    </div>
  );
}
