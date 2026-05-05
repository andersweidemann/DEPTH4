"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { useMemo, useState } from "react";
import { TIER_OFFERS } from "@/lib/tier";
import { CheckoutButton } from "./CheckoutButton";

export default function PricingPage() {
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");

  const prices = useMemo(() => {
    const analyst = billing === "yearly"
      ? process.env.NEXT_PUBLIC_STRIPE_PRICE_ANALYST_YEARLY || ""
      : process.env.NEXT_PUBLIC_STRIPE_PRICE_ANALYST_MONTHLY || "";
    const pro = billing === "yearly"
      ? process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_YEARLY || ""
      : process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY || "";
    return { analyst, pro };
  }, [billing]);

  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-4 py-3 flex items-center justify-between max-w-5xl mx-auto w-full">
        <Link href="/" className="font-semibold tracking-tight text-emerald-400">
          DEPTH4
        </Link>
        <div className="flex items-center gap-2">
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
            href="/signup?next=/onboarding"
            className={cn(buttonVariants({ size: "sm" }), "bg-emerald-600 text-zinc-950 hover:bg-emerald-500")}
          >
            Create account
          </Link>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-12 space-y-10">
        <div className="text-center space-y-2">
          <h1 className="text-3xl md:text-4xl font-semibold">Plans</h1>
          <p className="text-zinc-400 max-w-xl mx-auto text-sm">
            Quality-first tiers for macro traders. Yearly saves 2 months.
          </p>
        </div>
        <div className="flex items-center justify-center gap-2 text-xs text-zinc-400">
          <button
            type="button"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), billing === "monthly" && "bg-zinc-800 text-white")}
            onClick={() => setBilling("monthly")}
          >
            Monthly
          </button>
          <button
            type="button"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), billing === "yearly" && "bg-zinc-800 text-white")}
            onClick={() => setBilling("yearly")}
          >
            Yearly (2 months free)
          </button>
        </div>

        <div className="grid md:grid-cols-3 gap-4 max-w-5xl mx-auto">
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
              href="/signup?next=/onboarding"
              className={cn(
                buttonVariants({ variant: "secondary" }),
                "mt-6 w-full justify-center bg-zinc-800 text-zinc-200 border border-zinc-700",
              )}
            >
              Create account (Free)
            </Link>
          </div>

          <div className="rounded-2xl border-2 border-emerald-500/50 bg-zinc-900/80 p-6 flex flex-col text-left relative overflow-hidden">
            <span className="absolute top-3 right-3 text-[10px] font-bold uppercase bg-emerald-500 text-zinc-950 px-2 py-0.5 rounded">
              {TIER_OFFERS.analyst.badge}
            </span>
            <h2 className="text-lg font-semibold text-emerald-300">{TIER_OFFERS.analyst.name}</h2>
            <p className="text-3xl font-bold mt-2 text-zinc-50">
              {billing === "yearly" ? TIER_OFFERS.analyst.priceYearly : TIER_OFFERS.analyst.priceMonthly}
            </p>
            <p className="text-sm text-zinc-500 mt-1">Stripe checkout · cancel in portal</p>
            <p className="text-sm text-zinc-400 mt-2">{TIER_OFFERS.analyst.description}</p>
            <ul className="mt-4 space-y-2.5 text-sm text-zinc-200 flex-1">
              {TIER_OFFERS.analyst.features.map((t) => (
                <li key={t} className="flex gap-2">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  {t}
                </li>
              ))}
            </ul>
            <CheckoutButton priceId={prices.analyst} label="Go to Analyst checkout" cancelPath="/pricing" />
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 flex flex-col text-left">
            <h2 className="text-lg font-semibold text-zinc-200">{TIER_OFFERS.pro.name}</h2>
            <p className="text-3xl font-bold mt-2 text-zinc-50">
              {billing === "yearly" ? TIER_OFFERS.pro.priceYearly : TIER_OFFERS.pro.priceMonthly}
            </p>
            <p className="text-sm text-zinc-500 mt-1">Stripe checkout · cancel in portal</p>
            <p className="text-sm text-zinc-400 mt-2">{TIER_OFFERS.pro.description}</p>
            <ul className="mt-4 space-y-2.5 text-sm text-zinc-200 flex-1">
              {TIER_OFFERS.pro.features.map((t) => (
                <li key={t} className="flex gap-2">
                  <Check className="h-4 w-4 text-zinc-500 shrink-0 mt-0.5" />
                  {t}
                </li>
              ))}
            </ul>
            <CheckoutButton priceId={prices.pro} label="Go to Pro checkout" cancelPath="/pricing" />
          </div>
        </div>

        <p className="text-center text-xs text-zinc-600">Tax and final price may vary by region. Free tier and alert limits are subject to product updates.</p>
      </main>
    </div>
  );
}
