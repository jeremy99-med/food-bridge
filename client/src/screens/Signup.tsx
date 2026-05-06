import { useState } from "react";
import { useApp } from "@/store/app";
import { signup } from "@/lib/api";
import { useAuthNavigation } from "@/hooks/useAuthNavigation";
import Spinner from "@/components/Spinner";
import ErrorAlert from "@/components/ErrorAlert";

const RULES = [
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { label: "An uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "A number", test: (p: string) => /\d/.test(p) },
  { label: "A special character", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

const Signup = () => {
  const { setScreen, profileId, setAuth } = useApp();
  const { goBack, afterAuth } = useAuthNavigation();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showRules, setShowRules] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allRulesMet = RULES.every((r) => r.test(password));

  const submit = async () => {
    if (!username.trim() || !email.trim() || !allRulesMet) return;
    setError(null);
    setLoading(true);
    try {
      const res = await signup({
        username: username.trim(),
        email: email.trim(),
        password,
        profile_id: profileId || undefined,
      });
      setAuth(res.access_token, res.refresh_token, res.user);
      afterAuth();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Spinner message="Creating account…" /></div>;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-5 pt-8 pb-4 max-w-xl mx-auto w-full">
        <h1 className="text-3xl font-bold">Create account</h1>
        <p className="text-sm text-muted-foreground mt-1">Save meal plans and grocery lists across sessions.</p>
      </header>

      <main className="flex-1 max-w-xl mx-auto w-full px-5 pb-32 space-y-5">
        {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

        <div className="space-y-1">
          <span className="fb-section-title block">Username</span>
          <input
            className="fb-input"
            type="text"
            autoComplete="username"
            placeholder="yourname"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <span className="fb-section-title block">Email</span>
          <input
            className="fb-input"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <span className="fb-section-title block">Password</span>
          <input
            className="fb-input"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setShowRules(true); }}
            onFocus={() => setShowRules(true)}
          />
          {showRules && (
            <ul className="mt-2 space-y-1">
              {RULES.map((r) => {
                const met = r.test(password);
                return (
                  <li key={r.label} className={`text-xs flex items-center gap-1.5 ${met ? "text-foreground" : "text-muted-foreground"}`}>
                    <span>{met ? "✓" : "○"}</span>
                    {r.label}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <p className="text-sm text-muted-foreground pt-2">
          Already have an account?{" "}
          <button
            type="button"
            onClick={() => setScreen(6)}
            className="underline underline-offset-2 text-foreground font-medium"
          >
            Sign in
          </button>
        </p>
      </main>

      <footer className="fixed bottom-0 left-0 right-0 bg-background border-t border-foreground">
        <div className="max-w-xl mx-auto px-5 py-4 flex items-center gap-3">
          <button type="button" onClick={goBack} className="fb-btn-outline">Back</button>
          <button
            type="button"
            onClick={submit}
            disabled={!username.trim() || !email.trim() || !allRulesMet}
            className="fb-btn flex-1"
          >
            Create account
          </button>
        </div>
      </footer>
    </div>
  );
};

export default Signup;
