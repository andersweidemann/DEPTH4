"use client";

import type { FormEvent } from "react";
import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { safeAppPath } from "@/lib/app-paths";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { PublicTopBar } from "@/components/brand/PublicTopBar";

function isValidEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

function passwordMeetsRules(pw: string) {
  const p = pw;
  return {
    length: p.length >= 8,
    number: /\d/.test(p),
    letter: /[a-zA-Z]/.test(p),
  };
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh bg-[#0c0c0e] text-zinc-100 antialiased">
          <PublicTopBar backHref="/" backLabel="Back" />
          <div className="mx-auto max-w-6xl px-5 py-12">
            <p className="text-[12px] text-zinc-500">Loading…</p>
          </div>
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
  const next = useMemo(() => safeAppPath(sp.get("next") || "/onboarding"), [sp]);

  const supa = useMemo(() => createClient(), []);

  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  const rules = passwordMeetsRules(pw);
  const canSubmit =
    isValidEmail(email) && rules.length && rules.number && rules.letter && pw2.length > 0 && pw === pw2 && !submitting;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr("");

    if (!isValidEmail(email)) {
      setErr("Enter a valid email.");
      return;
    }
    if (pw !== pw2) {
      setErr("Passwords do not match.");
      return;
    }
    if (!(rules.length && rules.number && rules.letter)) {
      setErr("Password does not meet requirements.");
      return;
    }

    setSubmitting(true);
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const cb = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const { error } = await supa.auth.signUp({
        email: email.trim(),
        password: pw,
        options: { emailRedirectTo: cb },
      });
      if (error) {
        setErr(error.message);
        return;
      }
      router.push(`/login?next=${encodeURIComponent(next)}&intent=signin`);
    } catch (caught) {
      setErr(caught instanceof Error ? caught.message : "Sign up failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function google() {
    setErr("");
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
      setErr(caught instanceof Error ? caught.message : "Sign up failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-dvh bg-[#0c0c0e] text-zinc-100 antialiased">
      <PublicTopBar backHref="/" backLabel="Back" />
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-5 py-12 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-5">
          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-zinc-50">Create your account</h1>
          <p className="mt-3 max-w-md text-[13px] leading-relaxed text-zinc-300">
            Track unpriced macro narratives, monitor thesis probability, and review trades across the full news cycle.
          </p>
        </div>

        <div className="lg:col-span-7">
          <div className="max-w-xl bg-zinc-950/35 p-6 ring-1 ring-white/[0.08] sm:p-7">
            <form onSubmit={onSubmit} className="space-y-4" aria-label="Create account form">
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

                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Password</label>
                  <input
                    className="mt-2 w-full rounded-md bg-zinc-900/30 px-3 py-3 text-[16px] text-zinc-100 ring-1 ring-white/[0.08] focus:outline-none focus:ring-amber-500/25 sm:py-2 sm:text-[13px]"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Minimum 8 characters"
                    value={pw}
                    onChange={(e2) => setPw(e2.target.value)}
                  />
                  <div className="mt-2 grid gap-1 text-[11px] text-zinc-500">
                    <p className={cn(rules.length ? "text-zinc-300" : "text-zinc-500")}>- At least 8 characters</p>
                    <p className={cn(rules.letter ? "text-zinc-300" : "text-zinc-500")}>- Contains a letter</p>
                    <p className={cn(rules.number ? "text-zinc-300" : "text-zinc-500")}>- Contains a number</p>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
                    Confirm password
                  </label>
                  <input
                    className="mt-2 w-full rounded-md bg-zinc-900/30 px-3 py-3 text-[16px] text-zinc-100 ring-1 ring-white/[0.08] focus:outline-none focus:ring-amber-500/25 sm:py-2 sm:text-[13px]"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Repeat password"
                    value={pw2}
                    onChange={(e2) => setPw2(e2.target.value)}
                  />
                  {pw2.length > 0 && pw !== pw2 ? (
                    <p className="mt-2 text-[12px] text-red-300/90">Passwords do not match.</p>
                  ) : null}
                </div>
              </div>

              {err ? <p className="text-[12px] text-red-300/90">{err}</p> : null}

              <button
                type="submit"
                disabled={!canSubmit}
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "w-full justify-center rounded-md bg-amber-500 text-zinc-950 hover:bg-amber-400 disabled:opacity-50",
                )}
              >
                {submitting ? "Creating account…" : "Create account"}
              </button>

              <p className="text-[12px] text-zinc-500">
                Already have an account?{" "}
                <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-medium text-zinc-300 hover:text-zinc-100">
                  Log in
                </Link>
              </p>

              <div className="pt-2 text-[11px] leading-relaxed text-zinc-500">
                By creating an account, you agree to the{" "}
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
