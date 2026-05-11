"use client";

import type { FormEvent } from "react";
import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { safeAppPath } from "@/lib/app-paths";
import { createClient } from "@/lib/supabase/client";
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
  const supa = useMemo(() => createClient(), []);

  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [mode, setMode] = useState<"login" | "reset">("login");

  const canLogin = isValidEmail(email) && pw.length > 0 && !submitting;
  const canReset = isValidEmail(email) && !submitting;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setMsg("");

    if (!isValidEmail(email)) {
      setErr("Enter a valid email.");
      return;
    }

    if (mode === "reset") {
      setSubmitting(true);
      try {
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const { error } = await supa.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${origin}/login?next=${encodeURIComponent(next)}`,
        });
        if (error) {
          setErr(error.message);
          return;
        }
        setMsg("Check your email for a password reset link.");
      } catch (caught) {
        setErr(caught instanceof Error ? caught.message : "Request failed.");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!pw.length) {
      setErr("Enter your password.");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supa.auth.signInWithPassword({
        email: email.trim(),
        password: pw,
      });
      if (error) {
        setErr(error.message);
        return;
      }
      void remember;
      router.push(next);
    } catch (caught) {
      setErr(caught instanceof Error ? caught.message : "Log in failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function google() {
    setErr("");
    setMsg("");
    setSubmitting(true);
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const cb = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const { data, error } = await supa.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: cb },
      });
      if (error) {
        setErr(error.message);
        return;
      }
      if (data.url) window.location.assign(data.url);
      else setErr("Could not start Google sign-in. Try again.");
    } catch (caught) {
      setErr(caught instanceof Error ? caught.message : "Log in failed.");
    } finally {
      setSubmitting(false);
    }
  }

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
          <form onSubmit={onSubmit} className="space-y-0" aria-label="Log in form">
            <button
              type="button"
              onClick={() => void google()}
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-white py-2.5 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-100 disabled:opacity-60"
            >
              <GoogleIcon />
              Continue with Google
            </button>

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
                placeholder="you@domain.com"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e2) => setEmail(e2.target.value)}
                className="w-full rounded-md border border-white/[0.08] bg-zinc-900/50 px-3 py-2 text-[13px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>

            {mode === "login" ? (
              <>
                <div className="mt-4">
                  <label className="mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-zinc-500" htmlFor="login-password">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="login-password"
                      type={showPw ? "text" : "password"}
                      placeholder="Password"
                      autoComplete="current-password"
                      value={pw}
                      onChange={(e2) => setPw(e2.target.value)}
                      className="w-full rounded-md border border-white/[0.08] bg-zinc-900/50 px-3 py-2 pr-16 text-[13px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-slate-400"
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[12px] text-zinc-400 hover:text-zinc-200"
                      onClick={() => setShowPw((v) => !v)}
                      aria-label={showPw ? "Hide password" : "Show password"}
                    >
                      {showPw ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <label className="flex items-center gap-2 text-[12px] text-zinc-400">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e2) => setRemember(e2.target.checked)}
                      className="h-3.5 w-3.5 rounded border-white/[0.08] bg-zinc-900/50 accent-amber-500"
                    />
                    Remember me
                  </label>
                  <button
                    type="button"
                    className="text-[12px] text-zinc-400 hover:text-zinc-200"
                    onClick={() => {
                      setMode("reset");
                      setMsg("");
                      setErr("");
                    }}
                  >
                    Forgot password?
                  </button>
                </div>
              </>
            ) : (
              <div className="mt-4 rounded-md border border-white/[0.06] bg-zinc-900/40 px-4 py-3 text-[13px] text-zinc-300">
                <p className="font-medium text-zinc-100">Reset password</p>
                <p className="mt-1 text-zinc-400">We&apos;ll email you a reset link.</p>
                <button
                  type="button"
                  className="mt-3 text-[12px] font-medium text-zinc-400 hover:text-zinc-200"
                  onClick={() => {
                    setMode("login");
                    setMsg("");
                    setErr("");
                  }}
                >
                  ← Back to login
                </button>
              </div>
            )}

            {err ? <p className="mt-4 text-[12px] text-red-300/90">{err}</p> : null}
            {msg ? <p className="mt-4 text-[12px] text-emerald-200/90">{msg}</p> : null}

            <button
              type="submit"
              disabled={mode === "login" ? !canLogin : !canReset}
              className={cn(
                "mt-6 w-full rounded-md bg-amber-500 py-2.5 text-sm font-medium text-zinc-950 transition-colors hover:bg-amber-400 disabled:opacity-50",
              )}
            >
              {submitting ? (mode === "login" ? "Logging in…" : "Sending reset link…") : mode === "login" ? "Log in" : "Send reset link"}
            </button>

            <p className="mt-4 text-center text-[12px] text-zinc-400">
              Don&apos;t have an account?{" "}
              <Link href={`/signup?next=${encodeURIComponent(next)}`} className="text-zinc-200 hover:text-white">
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
    </div>
  );
}
