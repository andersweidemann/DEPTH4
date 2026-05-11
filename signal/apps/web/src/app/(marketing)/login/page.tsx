"use client";

import type { FormEvent } from "react";
import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { safeAppPath } from "@/lib/app-paths";

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
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

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl px-5 py-12">
          <p className="text-[12px] text-zinc-500">Loading…</p>
        </div>
      }
    >
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = useMemo(() => safeAppPath(sp.get("next") || "/theses"), [sp]);
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotDone, setForgotDone] = useState(false);

  const googleHref = `/api/auth/google?next=${encodeURIComponent(next)}`;
  const signupNext =
    next !== "/theses" ? `/signup?next=${encodeURIComponent(next)}` : "/signup";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login({ email: email.trim(), password, rememberMe });
      router.push(next);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Invalid email or password");
    } finally {
      setSubmitting(false);
    }
  };

  const closeForgot = () => {
    setForgotOpen(false);
    setForgotDone(false);
    setForgotEmail("");
  };

  const handleReset = async () => {
    setForgotBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        setError(body.message ?? "Request failed");
        return;
      }
      setForgotDone(true);
    } catch {
      setError("Request failed");
    } finally {
      setForgotBusy(false);
    }
  };

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-5 py-12 lg:grid-cols-2">
      <div className="hidden lg:block">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">Log in</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-zinc-400">
          Access your macro theses, live thesis conviction updates, and trade review.
        </p>
      </div>

      <div>
        <div className="rounded-lg border border-white/[0.06] bg-zinc-900/30 p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-0" aria-label="Log in form">
            {error && !forgotOpen ? (
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
              <label className="mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-zinc-500" htmlFor="login-email">
                Email
              </label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e2) => setEmail(e2.target.value)}
                required
                placeholder="you@domain.com"
                autoComplete="email"
                className="w-full rounded-md border border-white/[0.08] bg-zinc-900/50 px-3 py-2 text-[13px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>

            <div className="mt-4">
              <label className="mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-zinc-500" htmlFor="login-password">
                Password
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e2) => setPassword(e2.target.value)}
                  required
                  placeholder="Password"
                  autoComplete="current-password"
                  className="w-full rounded-md border border-white/[0.08] bg-zinc-900/50 px-3 py-2 pr-16 text-[13px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[12px] text-zinc-400 hover:text-zinc-200"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <label className="flex cursor-pointer items-center gap-2 text-[12px] text-zinc-400">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e2) => setRememberMe(e2.target.checked)}
                  className="h-3.5 w-3.5 rounded border-white/[0.08] bg-zinc-900/50 accent-amber-500"
                />
                Remember me
              </label>
              <button
                type="button"
                className="text-[12px] text-zinc-400 hover:text-zinc-200"
                onClick={() => {
                  setForgotOpen(true);
                  setForgotEmail(email);
                  setForgotDone(false);
                }}
              >
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="mt-6 w-full rounded-md bg-amber-500 py-2.5 text-sm font-medium text-zinc-950 transition-colors hover:bg-amber-400 disabled:opacity-50"
            >
              {submitting ? "Logging in..." : "Log in"}
            </button>

            <p className="mt-4 text-center text-[12px] text-zinc-400">
              Don&apos;t have an account?{" "}
              <Link href={signupNext} className="text-zinc-200 hover:text-white">
                Create account
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

      {forgotOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-sm rounded-lg border border-white/[0.06] bg-zinc-900 p-6">
            <h3 className="text-lg font-semibold text-zinc-100">Reset password</h3>
            <p className="mt-2 text-[13px] text-zinc-400">
              Enter your email and we&apos;ll send you a reset link.
            </p>
            {forgotDone ? (
              <p className="mt-4 text-[13px] text-emerald-300/90">
                If an account exists, a reset link has been sent.
              </p>
            ) : (
              <input
                type="email"
                value={forgotEmail}
                onChange={(e2) => setForgotEmail(e2.target.value)}
                placeholder="you@domain.com"
                className="mt-4 w-full rounded-md border border-white/[0.08] bg-zinc-900/50 px-3 py-2 text-[13px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeForgot}
                className="rounded-md px-3 py-1.5 text-[12px] text-zinc-400 hover:text-zinc-200"
              >
                {forgotDone ? "Close" : "Cancel"}
              </button>
              {!forgotDone ? (
                <button
                  type="button"
                  disabled={forgotBusy || !forgotEmail.trim()}
                  onClick={() => void handleReset()}
                  className="rounded-md bg-amber-500 px-3 py-1.5 text-[12px] font-medium text-zinc-950 hover:bg-amber-400 disabled:opacity-50"
                >
                  {forgotBusy ? "Sending…" : "Send link"}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
