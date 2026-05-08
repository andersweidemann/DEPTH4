"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { safeAppPath } from "@/lib/app-paths";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Depth4Wordmark } from "@/components/brand/Depth4Wordmark";
import { BackButton } from "@/components/brand/BackButton";

function isValidEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

export default function LoginPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = useMemo(() => safeAppPath(sp.get("next") || "/dashboard"), [sp]);
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
        // Dummy-friendly: send a reset email; the actual reset screen can be added later.
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
      // Supabase persists session by default; keep "remember me" as a UX hint for future wiring.
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
    <div className="min-h-dvh bg-[#0c0c0e] text-zinc-100 antialiased">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-5 py-12 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-5">
          <BackButton fallbackHref="/" label="Back" className="mb-3" />
          <Depth4Wordmark size="md" showTagline align="center" className="w-full" />

          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-zinc-50">Log in</h1>
          <p className="mt-3 max-w-md text-[13px] leading-relaxed text-zinc-300">
            Access your macro theses, live probability updates, and trade review.
          </p>
        </div>

        <div className="lg:col-span-7">
          <div className="max-w-xl bg-zinc-950/35 p-6 ring-1 ring-white/[0.08] sm:p-7">
            <form onSubmit={onSubmit} className="space-y-4" aria-label="Log in form">
              <button
                type="button"
                onClick={() => void google()}
                disabled={submitting}
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "w-full justify-center rounded-md bg-white text-zinc-900 hover:bg-zinc-200 disabled:opacity-60",
                )}
              >
                Continue with Google
              </button>

              <div className="flex items-center gap-3 py-1">
                <div className="h-px flex-1 bg-white/[0.06]" />
                <span className="text-[11px] text-zinc-500">or</span>
                <div className="h-px flex-1 bg-white/[0.06]" />
              </div>

              <div className="grid gap-3">
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Email</label>
                  <input
                    className="mt-2 w-full rounded-md bg-zinc-900/30 px-3 py-3 text-[16px] text-zinc-100 ring-1 ring-white/[0.08] focus:outline-none focus:ring-amber-500/25 sm:py-2 sm:text-[13px]"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    placeholder="you@domain.com"
                    value={email}
                    onChange={(e2) => setEmail(e2.target.value)}
                  />
                </div>

                {mode === "login" ? (
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Password</label>
                    <div className="mt-2 grid grid-cols-[1fr_auto] items-stretch gap-2">
                      <input
                        className="w-full rounded-md bg-zinc-900/30 px-3 py-3 text-[16px] text-zinc-100 ring-1 ring-white/[0.08] focus:outline-none focus:ring-amber-500/25 sm:py-2 sm:text-[13px]"
                        type={showPw ? "text" : "password"}
                        autoComplete="current-password"
                        placeholder="Password"
                        value={pw}
                        onChange={(e2) => setPw(e2.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPw((v) => !v)}
                        className="min-h-11 rounded-md bg-zinc-900/40 px-3 text-[12px] font-medium text-zinc-300 ring-1 ring-white/[0.08] hover:bg-zinc-900/55 sm:min-h-0 sm:text-[11px]"
                        aria-label={showPw ? "Hide password" : "Show password"}
                      >
                        {showPw ? "Hide" : "Show"}
                      </button>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[12px]">
                      <label className="flex items-center gap-2 text-zinc-500">
                        <input
                          type="checkbox"
                          checked={remember}
                          onChange={(e2) => setRemember(e2.target.checked)}
                          className="h-4 w-4 accent-amber-500"
                        />
                        Remember me
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setMode("reset");
                          setMsg("");
                          setErr("");
                        }}
                        className="font-medium text-zinc-300 hover:text-zinc-100"
                      >
                        Forgot password?
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-zinc-900/20 px-4 py-3 text-[12px] text-zinc-300">
                    <p className="font-medium text-zinc-100">Reset password</p>
                    <p className="mt-1 text-zinc-400">We’ll email you a reset link.</p>
                    <div className="mt-3">
                      <button
                        type="button"
                        className="text-[12px] font-medium text-zinc-300 hover:text-zinc-100"
                        onClick={() => {
                          setMode("login");
                          setMsg("");
                          setErr("");
                        }}
                      >
                        ← Back to login
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {err ? <p className="text-[12px] text-red-300/90">{err}</p> : null}
              {msg ? <p className="text-[12px] text-emerald-200/90">{msg}</p> : null}

              <button
                type="submit"
                disabled={mode === "login" ? !canLogin : !canReset}
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "w-full justify-center rounded-md bg-amber-500 text-zinc-950 hover:bg-amber-400 disabled:opacity-50",
                )}
              >
                {submitting ? (mode === "login" ? "Logging in…" : "Sending reset link…") : mode === "login" ? "Log in" : "Send reset link"}
              </button>

              <p className="text-[12px] text-zinc-500">
                Don&apos;t have an account?{" "}
                <Link href={`/signup?next=${encodeURIComponent(next)}`} className="font-medium text-zinc-300 hover:text-zinc-100">
                  Create account
                </Link>
              </p>

              <div className="pt-2 text-[11px] leading-relaxed text-zinc-500">
                By continuing, you agree to DEPTH4&apos;s{" "}
                <Link href="/terms" className="font-medium text-zinc-300 hover:text-zinc-100">
                  Terms of Use
                </Link>
                ,{" "}
                <Link href="/privacy" className="font-medium text-zinc-300 hover:text-zinc-100">
                  Privacy Policy
                </Link>
                , and{" "}
                <Link href="/risk-disclosure" className="font-medium text-zinc-300 hover:text-zinc-100">
                  Risk Disclosure
                </Link>
                .
              </div>
              <p className="text-[11px] leading-relaxed text-zinc-500">
                DEPTH4 is an analysis and information tool, not personalized investment advice.
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
