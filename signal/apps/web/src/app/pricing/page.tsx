"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { Suspense, useMemo, useState } from "react";
import { TIER_OFFERS } from "@/lib/tier";
import { PublicTopBar } from "@/components/brand/PublicTopBar";
import { useSearchParams } from "next/navigation";

export default function PricingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh bg-zinc-950 text-zinc-100">
          <PublicTopBar backHref="/" />
          <main className="mx-auto max-w-5xl px-4 py-12">
            <p className="text-[12px] text-zinc-500">Loading…</p>
          </main>
        </div>
      }
    >
      <PricingPageInner />
    </Suspense>
  );
}

function PricingPageInner() {
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const sp = useSearchParams();
  const recommended = (sp.get("recommended") || "").toLowerCase();
  const source = sp.get("source") || "";
  const recoTier = recommended === "pro" || recommended === "analyst" ? recommended : "";

  const annualNote = useMemo(() => "Annual pricing reflects 2 months free.", []);

  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-100">
      <PublicTopBar
        backHref="/"
        right={
          <>
            <Link
              href="/login"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "text-zinc-300 hover:text-white hover:bg-zinc-800",
              )}
            >
              Sign in
            </Link>
            <Link
              href="/signup?next=/theses"
              className={cn(buttonVariants({ size: "sm" }), "bg-amber-500 text-zinc-950 hover:bg-amber-400")}
            >
              Create account
            </Link>
          </>
        }
      />
      <main className="max-w-5xl mx-auto px-4 py-12 space-y-12">
        <div className="text-center space-y-3">
          <h1 className="text-3xl md:text-4xl font-semibold">Pricing</h1>
          <p className="text-zinc-400 max-w-2xl mx-auto text-sm leading-relaxed">
            Start free. Upgrade when you&apos;re ready to create your own theses, publish them, or turn your track record into revenue.
          </p>
          {recoTier ? (
            <p className="mx-auto max-w-2xl text-[12px] leading-relaxed text-zinc-500">
              Recommended: <span className="text-zinc-200">{recoTier === "analyst" ? "Analyst" : "Pro"}</span>
              {source ? <span className="text-zinc-600"> · triggered from “{source}”</span> : null}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-zinc-400">
          <button
            type="button"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "min-h-11 px-4 text-[14px] sm:min-h-0 sm:px-3 sm:text-xs",
              billing === "monthly" && "bg-zinc-800 text-white",
            )}
            onClick={() => setBilling("monthly")}
          >
            Monthly
          </button>
          <button
            type="button"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "min-h-11 px-4 text-[14px] sm:min-h-0 sm:px-3 sm:text-xs",
              billing === "yearly" && "bg-zinc-800 text-white",
            )}
            onClick={() => setBilling("yearly")}
          >
            Yearly (2 months free)
          </button>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 flex flex-col text-left">
            <h2 className="text-lg font-semibold text-zinc-200">{TIER_OFFERS.free.name}</h2>
            <p className="text-3xl font-bold mt-2 text-zinc-50">{TIER_OFFERS.free.priceMonthly}</p>
            <p className="text-sm text-zinc-500 mt-1">{TIER_OFFERS.free.description}</p>
            <ul className="mt-4 space-y-2.5 text-sm text-zinc-300 flex-1">
              {TIER_OFFERS.free.features.map((t) => (
                <li key={t} className="flex gap-2">
                  <Check className="h-4 w-4 text-zinc-500 shrink-0 mt-0.5" />
                  {t}
                </li>
              ))}
            </ul>
            <Link
              href="/signup?next=/theses"
              className={cn(
                buttonVariants({ variant: "secondary" }),
                "mt-6 w-full justify-center bg-zinc-800 text-zinc-200 border border-zinc-700",
              )}
            >
              Create account (Free)
            </Link>
          </div>

          <div
            className={cn(
              "rounded-2xl border-2 bg-zinc-900/80 p-6 flex flex-col text-left relative overflow-hidden",
              recoTier === "analyst" ? "border-amber-500/60" : "border-amber-500/40",
            )}
          >
            <span className="absolute top-3 right-3 text-[10px] font-bold uppercase bg-amber-500 text-zinc-950 px-2 py-0.5 rounded">
              {TIER_OFFERS.analyst.badge}
            </span>
            <h2 className="text-lg font-semibold text-amber-200/90">{TIER_OFFERS.analyst.name}</h2>
            <p className="text-3xl font-bold mt-2 text-zinc-50">
              {billing === "yearly" ? TIER_OFFERS.analyst.priceYearly : TIER_OFFERS.analyst.priceMonthly}
            </p>
            <p className="text-sm text-zinc-400 mt-2">{TIER_OFFERS.analyst.description}</p>
            <ul className="mt-4 space-y-2.5 text-sm text-zinc-200 flex-1">
              {TIER_OFFERS.analyst.features.map((t) => (
                <li key={t} className="flex gap-2">
                  <Check className="h-4 w-4 text-amber-300 shrink-0 mt-0.5" />
                  {t}
                </li>
              ))}
            </ul>
            <Link
              href="/signup?next=/theses"
              className={cn(buttonVariants({ size: "default" }), "mt-6 w-full justify-center bg-amber-500 text-zinc-950 hover:bg-amber-400")}
            >
              Choose Analyst
            </Link>
          </div>

          <div
            className={cn(
              "rounded-2xl border bg-zinc-900/60 p-6 flex flex-col text-left",
              recoTier === "pro" ? "border-amber-500/30" : "border-zinc-800",
            )}
          >
            <h2 className="text-lg font-semibold text-zinc-200">{TIER_OFFERS.pro.name}</h2>
            <p className="text-3xl font-bold mt-2 text-zinc-50">
              {billing === "yearly" ? TIER_OFFERS.pro.priceYearly : TIER_OFFERS.pro.priceMonthly}
            </p>
            <p className="text-sm text-zinc-400 mt-2">{TIER_OFFERS.pro.description}</p>
            <ul className="mt-4 space-y-2.5 text-sm text-zinc-200 flex-1">
              {TIER_OFFERS.pro.features.map((t) => (
                <li key={t} className="flex gap-2">
                  <Check className="h-4 w-4 text-zinc-500 shrink-0 mt-0.5" />
                  {t}
                </li>
              ))}
            </ul>
            <Link
              href="/signup?next=/theses"
              className={cn(
                buttonVariants({ variant: "secondary" }),
                "mt-6 w-full justify-center bg-zinc-800 text-zinc-200 border border-zinc-700",
              )}
            >
              Choose Pro
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 sm:p-6">
          <h2 className="text-sm font-semibold text-zinc-100">Comparison</h2>
          <p className="mt-2 text-sm text-zinc-500">{annualNote}</p>
          <p className="mt-4 text-[11px] text-zinc-600 sm:hidden">Tip: swipe the table to see all columns.</p>
          <div className="mt-4 overflow-x-auto sm:mt-5">
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="py-2 pr-4">Capability</th>
                  <th className="py-2 pr-4">Free</th>
                  <th className="py-2 pr-4">Analyst</th>
                  <th className="py-2 pr-4">Pro</th>
                  {/* Creator tier hidden for now */}
                </tr>
              </thead>
              <tbody className="text-[12px] text-zinc-300">
                {[
                  ["Insider Flow Detector", "Last 24h indicator only", "Full 7-day log + probability suggestions", "Real-time alerts + auto-apply updates"],
                  ["System theses access", "Limited", "Full", "Full"],
                  ["Create private theses", "—", "✓", "✓"],
                  ["Live thesis conviction updates", "Limited", "✓", "✓"],
                  ["Evidence timeline", "Limited", "✓", "✓"],
                  ["Email alerts", "Limited", "✓", "✓"],
                  ["Publish theses publicly", "—", "—", "✓"],
                  ["Leaderboard ranking", "—", "—", "✓"],
                  ["Thesis analytics", "—", "—", "✓"],
                ].map(([cap, a, b, c]) => (
                  <tr key={cap} className="border-t border-zinc-800">
                    <td className="py-2 pr-4 text-zinc-400">{cap}</td>
                    <td className="py-2 pr-4">{a}</td>
                    <td className="py-2 pr-4">{b}</td>
                    <td className="py-2 pr-4">{c}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
            <h2 className="text-sm font-semibold text-zinc-100">FAQ</h2>
            <div className="mt-4 space-y-4 text-sm text-zinc-400">
              <div>
                <p className="font-medium text-zinc-200">Is this real billing?</p>
                <p className="mt-1">
                  Paid plans use secure checkout. The free tier does not require a payment method; upgrade when you need Analyst or Pro features.
                </p>
              </div>
              <div>
                <p className="font-medium text-zinc-200">Why four tiers?</p>
                <p className="mt-1">DEPTH4 supports individual workflow, community publishing, and creator economics. Each tier unlocks the next loop.</p>
              </div>
              <div>
                <p className="font-medium text-zinc-200">What&apos;s included in annual?</p>
                <p className="mt-1">Annual is transparent: pay for 10 months, get 12.</p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-6">
            <h2 className="text-sm font-semibold text-zinc-100">Ready to track your ideas inside DEPTH4?</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Start Free. Upgrade when you need private thesis tracking, then publish and monetize as you build a track record.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/theses"
                className={cn(buttonVariants({ variant: "secondary" }), "bg-zinc-800 text-zinc-200 border border-zinc-700")}
              >
                Open thesis engine
              </Link>
              <Link
                href="/signup?next=/theses"
                className={cn(buttonVariants({ size: "default" }), "bg-amber-500 text-zinc-950 hover:bg-amber-400")}
              >
                Create account
              </Link>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-zinc-600">
          Prices shown in USD. Free tier limits and feature availability may change as DEPTH4 evolves.
        </p>
      </main>
    </div>
  );
}
