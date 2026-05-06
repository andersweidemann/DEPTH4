"use client";

import { Button } from "@/components/ui/button";
import { safeAppPath } from "@/lib/app-paths";
import { TIER_OFFERS } from "@/lib/tier";
import { createClient } from "@/lib/supabase/client";
import { Check } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

type Props = {
  nextPath: string;
  intent: "signin" | "signup";
};

export function AuthPanel({ nextPath, intent }: Props) {
  const s = createClient();
  const [e, se] = useState("");
  const [msg, sm] = useState("");
  const [err, setErr] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreeRisk, setAgreeRisk] = useState(false);
  const [agreeNotAdvice, setAgreeNotAdvice] = useState(false);

  const next = useMemo(() => safeAppPath(nextPath), [nextPath]);
  const canCreate = intent !== "signup" || (agreeTerms && agreeRisk && agreeNotAdvice);

  const google = useCallback(async () => {
    setErr("");
    sm("");
    try {
      const origin = typeof window !== "undefined" ? location.origin : "";
      const cb = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const { data, error } = await s.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: cb },
      });
      if (error) {
        setErr(error.message);
        return;
      }
      if (data.url) {
        window.location.assign(data.url);
        return;
      }
      setErr("Could not start Google sign-in. Try again.");
    } catch (caught) {
      setErr(caught instanceof Error ? caught.message : "Sign-in failed");
    }
  }, [s.auth, next]);

  const em = useCallback(async () => {
    setErr("");
    sm("Check your email for a link. New accounts and returning users use the same link.");
    const origin = typeof window !== "undefined" ? location.origin : "";
    const cb = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await s.auth.signInWithOtp({
      email: e,
      options: { emailRedirectTo: cb },
    });
    if (error) {
      sm("");
      setErr(error.message);
    }
  }, [s.auth, e, next]);

  const h1 = intent === "signup" ? "Create your account" : "Sign in to DEPTH4";
  const lead =
    intent === "signup"
      ? "Start on Observer. Upgrade when you want scenarios, deeper tools, and more alerts."
      : "Welcome back. New here? The same page creates your account—pick Google or a magic link.";

  return (
    <div className="w-full max-w-5xl mx-auto">
      <div className="grid gap-8 lg:grid-cols-[1fr_minmax(0,24rem)] lg:gap-10 items-stretch">
        <div className="space-y-4 text-left order-2 lg:order-1">
          <p className="text-xs font-mono text-emerald-500/80 uppercase tracking-[0.2em]">Tiers</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
              <div>
                <h2 className="text-lg font-semibold text-zinc-100">{TIER_OFFERS.free.name}</h2>
                <p className="text-2xl font-bold text-zinc-50 mt-0.5">{TIER_OFFERS.free.priceMonthly}</p>
                <p className="text-xs text-zinc-500 mt-1">{TIER_OFFERS.free.description}</p>
              </div>
              <ul className="space-y-1.5 text-sm text-zinc-400">
                {TIER_OFFERS.free.features.map((t) => (
                  <li key={t} className="flex gap-2">
                    <Check className="h-4 w-4 text-zinc-500 shrink-0 mt-0.5" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/25 p-4 space-y-3">
              <div>
                <h2 className="text-lg font-semibold text-emerald-300">{TIER_OFFERS.analyst.name}</h2>
                <p className="text-2xl font-bold text-zinc-50 mt-0.5">{TIER_OFFERS.analyst.priceMonthly}</p>
                <p className="text-xs text-zinc-500 mt-1">{TIER_OFFERS.analyst.description}</p>
              </div>
              <ul className="space-y-1.5 text-sm text-zinc-300">
                {TIER_OFFERS.analyst.features.map((t) => (
                  <li key={t} className="flex gap-2">
                    <Check className="h-4 w-4 text-emerald-500/90 shrink-0 mt-0.5" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
              <div>
                <h2 className="text-lg font-semibold text-zinc-100">{TIER_OFFERS.pro.name}</h2>
                <p className="text-2xl font-bold text-zinc-50 mt-0.5">{TIER_OFFERS.pro.priceMonthly}</p>
                <p className="text-xs text-zinc-500 mt-1">{TIER_OFFERS.pro.description}</p>
              </div>
              <ul className="space-y-1.5 text-sm text-zinc-400">
                {TIER_OFFERS.pro.features.map((t) => (
                  <li key={t} className="flex gap-2">
                    <Check className="h-4 w-4 text-zinc-500 shrink-0 mt-0.5" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
              <div>
                <h2 className="text-lg font-semibold text-zinc-100">{TIER_OFFERS.creator.name}</h2>
                <p className="text-2xl font-bold text-zinc-50 mt-0.5">{TIER_OFFERS.creator.priceMonthly}</p>
                <p className="text-xs text-zinc-500 mt-1">{TIER_OFFERS.creator.description}</p>
              </div>
              <ul className="space-y-1.5 text-sm text-zinc-400">
                {TIER_OFFERS.creator.features.map((t) => (
                  <li key={t} className="flex gap-2">
                    <Check className="h-4 w-4 text-zinc-500 shrink-0 mt-0.5" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="text-xs text-zinc-600">
            <Link href="/pricing" className="text-emerald-500/90 hover:text-emerald-400">
              Full comparison
            </Link>{" "}
            · Billing is not wired yet (dummy).
          </p>
        </div>

        <div className="order-1 lg:order-2">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6 md:p-8">
            <Link href="/" className="text-sm font-semibold text-emerald-400 hover:text-emerald-300">
              DEPTH4
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-50 mt-2">{h1}</h1>
            <p className="text-zinc-400 text-sm mt-2 leading-relaxed">{lead}</p>

            <div className="mt-6 space-y-3">
              <Button
                onClick={() => void google()}
                className="w-full bg-white text-zinc-900 hover:bg-zinc-200"
                size="lg"
                type="button"
                disabled={!canCreate}
              >
                Continue with Google
              </Button>
              <p className="text-center text-xs text-zinc-500">or</p>
              <div className="space-y-2">
                <input
                  className="w-full rounded-md border border-zinc-600 bg-zinc-950/50 p-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  type="email"
                  autoComplete="email"
                  placeholder="Work email"
                  value={e}
                  onChange={(c) => se(c.target.value)}
                />
                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-zinc-950"
                  type="button"
                  onClick={() => void em()}
                  disabled={!e.includes("@") || !canCreate}
                >
                  Email me a sign-in link
                </Button>
              </div>
            </div>

            {intent === "signup" && (
              <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-950/30 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Required</p>
                <div className="mt-3 space-y-3 text-sm text-zinc-300">
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 accent-emerald-500"
                      checked={agreeTerms}
                      onChange={(ev) => setAgreeTerms(ev.target.checked)}
                    />
                    <span className="leading-relaxed">
                      I have read and agree to the{" "}
                      <Link href="/terms" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2">
                        Terms of Use
                      </Link>
                      .
                    </span>
                  </label>
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 accent-emerald-500"
                      checked={agreeRisk}
                      onChange={(ev) => setAgreeRisk(ev.target.checked)}
                    />
                    <span className="leading-relaxed">
                      I have read and understand the{" "}
                      <Link href="/risk" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2">
                        Risk Disclosure
                      </Link>
                      .
                    </span>
                  </label>
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 accent-emerald-500"
                      checked={agreeNotAdvice}
                      onChange={(ev) => setAgreeNotAdvice(ev.target.checked)}
                    />
                    <span className="leading-relaxed">
                      I understand DEPTH4 provides information, not investment advice.
                    </span>
                  </label>
                </div>
                {!canCreate && (
                  <p className="mt-3 text-xs text-rose-300/90">
                    You must check all three boxes before creating an account.
                  </p>
                )}
              </div>
            )}

            {err && <p className="text-sm text-rose-400/90 mt-4 break-words">{err}</p>}
            {msg && <p className="text-sm text-emerald-400/90 mt-4 break-words">{msg}</p>}

            <p className="text-xs text-zinc-500 mt-6">
              {intent === "signup" ? "Already have an account? " : "Need an account? "}
              <Link
                href={intent === "signup" ? `/login?next=${encodeURIComponent(next)}` : `/signup?next=${encodeURIComponent(next)}`}
                className="text-emerald-500 hover:underline"
              >
                {intent === "signup" ? "Sign in" : "Sign up (same flow)"}
              </Link>
            </p>

            {intent === "signup" && (
              <p className="text-xs text-zinc-600 mt-4 leading-relaxed">
                By creating an account, you agree to the Terms and acknowledge the Risk Disclosure. See also our{" "}
                <Link href="/privacy" className="text-zinc-400 hover:text-zinc-200 underline underline-offset-2">
                  Privacy Policy
                </Link>{" "}
                and{" "}
                <Link href="/disclaimer" className="text-zinc-400 hover:text-zinc-200 underline underline-offset-2">
                  Disclaimer
                </Link>
                .
              </p>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
