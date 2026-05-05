"use client";

import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import LoadingSpinner from "@/components/LoadingSpinner";

export default function LoginPage(): JSX.Element {
  const {
    user,
    loading,
    authError,
    signInWithGoogle,
    signInWithEmailPassword,
    registerWithEmailPassword,
    clearAuthError
  } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isEmailSigningIn, setIsEmailSigningIn] = useState(false);
  const [mode, setMode] = useState<"sign-in" | "register">("sign-in");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user !== null) {
      router.replace("/");
    }
  }, [user, loading, router]);

  useEffect(() => {
    return () => {
      clearAuthError();
    };
  }, [clearAuthError]);

  const handleGoogleSignIn = async (): Promise<void> => {
    setLocalError(null);
    setIsSigningIn(true);
    await signInWithGoogle();
    setIsSigningIn(false);
  };

  const handleEmailPasswordSignIn = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setLocalError(null);

    if (mode === "register" && password !== confirmPassword) {
      setLocalError("Passwords do not match.");
      return;
    }

    setIsEmailSigningIn(true);
    if (mode === "register") {
      await registerWithEmailPassword(email, password);
    } else {
      await signInWithEmailPassword(email, password);
    }
    setIsEmailSigningIn(false);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-fog">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-fog px-4 py-10 sm:px-6">
      <section className="w-full max-w-md rounded-3xl glass-panel p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brass">
          {mode === "register" ? "Create Account" : "Secure Sign In"}
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-ink">
          Vehicle Market Tracker
        </h1>
        <p className="mt-4 max-w-sm text-sm text-ink/60">
          Search real-time pricing trends and get a buy-vs-wait score for any
          make, model, and year.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-2 rounded-xl border border-stroke bg-panel-soft p-1">
          <button
            type="button"
            onClick={() => {
              setMode("sign-in");
              setLocalError(null);
              clearAuthError();
            }}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              mode === "sign-in" ? "bg-panel text-ink shadow-sm" : "text-ink/55 hover:text-ink"
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("register");
              setLocalError(null);
              clearAuthError();
            }}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              mode === "register" ? "bg-panel text-ink shadow-sm" : "text-ink/55 hover:text-ink"
            }`}
          >
            Register
          </button>
        </div>
        <form className="mt-6 space-y-4" onSubmit={(event) => void handleEmailPasswordSignIn(event)}>
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-ink/55" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-stroke bg-panel px-4 py-3 text-sm text-ink outline-none transition-colors placeholder:text-ink/35 focus:border-brass"
              placeholder="you@example.com"
              required
            />
          </div>
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-ink/55" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-stroke bg-panel px-4 py-3 text-sm text-ink outline-none transition-colors placeholder:text-ink/35 focus:border-brass"
              placeholder="Enter your password"
              required
            />
          </div>
          {mode === "register" && (
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-ink/55" htmlFor="confirmPassword">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="w-full rounded-lg border border-stroke bg-panel px-4 py-3 text-sm text-ink outline-none transition-colors placeholder:text-ink/35 focus:border-brass"
                placeholder="Re-enter your password"
                required
              />
            </div>
          )}
          <button
            type="submit"
            disabled={isEmailSigningIn || isSigningIn}
            className="w-full rounded-lg bg-ink px-6 py-3 text-sm font-semibold text-fog transition-colors hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isEmailSigningIn
              ? mode === "register"
                ? "Creating account..."
                : "Signing in..."
              : mode === "register"
                ? "Create account"
                : "Sign in with email"}
          </button>
        </form>
        <div className="mt-6 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-ink/35">
          <span className="h-px flex-1 bg-stroke" />
          <span>Or continue with Google</span>
          <span className="h-px flex-1 bg-stroke" />
        </div>
        <button
          type="button"
          onClick={() => void handleGoogleSignIn()}
          disabled={isSigningIn || isEmailSigningIn}
          className="mt-6 flex w-full items-center justify-center gap-3 rounded-lg border border-stroke bg-panel-soft px-6 py-3 text-sm font-medium text-ink shadow-sm transition-colors hover:bg-panel disabled:cursor-not-allowed disabled:opacity-70"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          {isSigningIn ? "Starting sign-in..." : "Continue with Google"}
        </button>
        {(localError !== null || authError !== null) && (
          <p className="mt-4 max-w-md rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-300">
            {localError ?? authError}
          </p>
        )}
      </section>
    </main>
  );
}
