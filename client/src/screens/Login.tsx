import { useState } from "react";
import { useApp } from "@/store/app";
import { login } from "@/lib/api";
import { useAuthNavigation } from "@/hooks/useAuthNavigation";
import Spinner from "@/components/Spinner";
import ErrorAlert from "@/components/ErrorAlert";

const Login = () => {
  const { setScreen, setAuth } = useApp();
  const { goBack, afterAuth } = useAuthNavigation();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!identifier.trim() || !password) return;
    setError(null);
    setLoading(true);
    try {
      const res = await login({ identifier: identifier.trim(), password });
      setAuth(res.access_token, res.refresh_token, res.user);
      afterAuth();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") submit();
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Spinner message="Signing in…" /></div>;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-5 pt-8 pb-4 max-w-xl mx-auto w-full">
        <h1 className="text-3xl font-bold">Sign in</h1>
        <p className="text-sm text-muted-foreground mt-1">Welcome back to FoodBridge.</p>
      </header>

      <main className="flex-1 max-w-xl mx-auto w-full px-5 pb-32 space-y-5">
        {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

        <div className="space-y-1">
          <span className="fb-section-title block">Email or username</span>
          <input
            className="fb-input"
            type="text"
            autoComplete="username"
            placeholder="you@example.com"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        <div className="space-y-1">
          <span className="fb-section-title block">Password</span>
          <input
            className="fb-input"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        <p className="text-sm text-muted-foreground pt-2">
          Don't have an account?{" "}
          <button
            type="button"
            onClick={() => setScreen(7)}
            className="underline underline-offset-2 text-foreground font-medium"
          >
            Sign up
          </button>
        </p>
      </main>

      <footer className="fixed bottom-0 left-0 right-0 bg-background border-t border-foreground">
        <div className="max-w-xl mx-auto px-5 py-4 flex items-center gap-3">
          <button type="button" onClick={goBack} className="fb-btn-outline">Back</button>
          <button
            type="button"
            onClick={submit}
            disabled={!identifier.trim() || !password}
            className="fb-btn flex-1"
          >
            Sign in
          </button>
        </div>
      </footer>
    </div>
  );
};

export default Login;
