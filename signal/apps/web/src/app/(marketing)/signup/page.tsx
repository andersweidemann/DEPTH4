"use client";

import type { FormEvent } from "react";
import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { safeAppPath } from "@/lib/app-paths";
import { cn } from "@/lib/utils";

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function isValidEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl px-5 py-12">
          <p className="text-[12px] text-zinc-500">Loading…</p>
        </div>
      }
    >
      <SignupPageInner />
    </Suspense>
  );
}

function SignupPageInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = useMemo(() => safeAppPath(sp.get("next") || "/theses"), [sp]);
  const { signup } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const googleHref = `/api/auth/google?next=${encodeURIComponent(next)}`;
  const loginHref =
    next !== "/theses" ? `/login?next=${encodeURIComponent(next)}` : "/login";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isValidEmail(email)) {
      setError("Enter a valid email.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (!/[a-zA-Z]/.test(password)) {
      setError("Password must contain a letter");
      return;
    }
    if (!/[0-9]/.test(password)) {
      setError("Password must contain a number");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setSubmitting(true);
    try {
      await signup({ email: email.trim(), password });
      router.push(next);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Sign up failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-5 py-12 lg:grid-cols-2">
      <div className="hidden lg:block">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">Create your account</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-zinc-400">
          Track unpriced macro narratives, monitor thesis probability, and review trades across the full news cycle.
        </p>
      </div>

      <div>
        <div className="rounded-lg border border-white/[0.06] bg-zinc-900/30 p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-0" aria-label="Create account form">
            {error ? (
              <div className="mb-4 rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2">
                <p className="text-[12px] text-red-400">{error}</p>
              </div>
            ) : null}

            <a
              href={googleHref}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-white py-2.5 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-100"
            >
              <GoogleIcon />
              Continue with Google
            </a>

            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-white/[0.06]" />
              <span className="text-[12px] text-zinc-500">or</span>
              <div className="h-px flex-1 bg-white/[0.06]" />
            </div>

            <div>
              <label className="mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-zinc-500" htmlFor="signup-email">
                Email
              </label>
              <input
                id="signup-email"
                type="email"
                placeholder="you@domain.com"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e2) => setEmail(e2.target.value)}
                required
                className="w-full rounded-md border border-white/[0.08] bg-zinc-900/50 px-3 py-2 text-[13px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>

            <div className="mt-4">
              <label className="mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-zinc-500" htmlFor="signup-password">
                Password
              </label>
              <div className="relative">
                <input
                  id="signup-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Minimum 8 characters"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e2) => setPassword(e2.target.value)}
                  required
                  className="w-full rounded-md border border-white/[0.08] bg-zinc-900/50 px-3 py-2 pr-16 text-[13px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[12px] text-zinc-400 hover:text-zinc-200"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              <div className="mt-2 space-y-1">
                <p className={cn("text-[11px]", password.length >= 8 ? "text-emerald-400" : "text-zinc-500")}>
                  - At least 8 characters
                </p>
                <p className={cn("text-[11px]", /[a-zA-Z]/.test(password) ? "text-emerald-400" : "text-zinc-500")}>
                  - Contains a letter
                </p>
                <p className={cn("text-[11px]", /[0-9]/.test(password) ? "text-emerald-400" : "text-zinc-500")}>
                  - Contains a number
                </p>
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-zinc-500" htmlFor="signup-password2">
                Confirm password
              </label>
              <input
                id="signup-password2"
                type="password"
                placeholder="Repeat password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e2) => setConfirmPassword(e2.target.value)}
                required
                className="w-full rounded-md border border-white/[0.08] bg-zinc-900/50 px-3 py-2 text-[13px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="mt-6 w-full rounded-md bg-amber-500 py-2.5 text-sm font-medium text-zinc-950 transition-colors hover:bg-amber-400 disabled:opacity-50"
            >
              {submitting ? "Creating account…" : "Create account"}
            </button>

            <p className="mt-4 text-center text-[12px] text-zinc-400">
              Already have an account?{" "}
              <Link href={loginHref} className="text-zinc-200 hover:text-white">
                Log in
              </Link>
            </p>

            <p className="mt-6 text-center text-[11px] leading-relaxed text-zinc-500">
              By continuing, you agree to DEPTH4&apos;s{" "}
              <Link href="/terms" className="text-zinc-400 underline hover:text-zinc-200">
                Terms of Use
              </Link>
              ,{" "}
              <Link href="/privacy" className="text-zinc-400 underline hover:text-zinc-200">
                Privacy Policy
              </Link>
              , and{" "}
              <Link href="/risk-disclosure" className="text-zinc-400 underline hover:text-zinc-200">
                Risk Disclosure
              </Link>
              .
            </p>
            <p className="mt-2 text-center text-[11px] text-zinc-600">
              DEPTH4 is an analysis and information tool, not personalized investment advice.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
