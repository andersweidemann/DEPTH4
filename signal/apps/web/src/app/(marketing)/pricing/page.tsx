"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Suspense, useState } from "react";

export default function PricingPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl px-5 py-12">
          <p className="text-[12px] text-zinc-500">Loading…</p>
        </div>
      }
    >
      <PricingPageInner />
    </Suspense>
  );
}

function Cell({ children }: { children: ReactNode }) {
  return <span className="inline-flex justify-center">{children}</span>;
}

function PricingPageInner() {
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");

  const analystPrice =
    billing === "monthly" ? (
      <>
        $29 <span className="text-lg font-normal text-zinc-400">/ mo</span>
      </>
    ) : (
      <>
        $290 <span className="text-lg font-normal text-zinc-400">/ yr</span>
      </>
    );

  const proPrice =
    billing === "monthly" ? (
      <>
        $79 <span className="text-lg font-normal text-zinc-400">/ mo</span>
      </>
    ) : (
      <>
        $790 <span className="text-lg font-normal text-zinc-400">/ yr</span>
      </>
    );

  const comparisonRows: { name: string; free: ReactNode; analyst: ReactNode; pro: ReactNode }[] = [
    {
      name: "Insider Flow Detector",
      free: "Last 24h indicator only",
      analyst: "Full 7-day log + probability suggestions",
      pro: "Real-time alerts + auto-apply updates",
    },
    {
      name: "System theses access",
      free: "Limited",
      analyst: "Full",
      pro: "Full",
    },
    {
      name: "Create private theses",
      free: <span className="text-zinc-600">—</span>,
      analyst: (
        <Cell>
          <span className="text-zinc-400">✓</span>
        </Cell>
      ),
      pro: (
        <Cell>
          <span className="text-zinc-400">✓</span>
        </Cell>
      ),
    },
    {
      name: "Live thesis conviction updates",
      free: "Limited",
      analyst: (
        <Cell>
          <span className="text-zinc-400">✓</span>
        </Cell>
      ),
      pro: (
        <Cell>
          <span className="text-zinc-400">✓</span>
        </Cell>
      ),
    },
    {
      name: "Evidence timeline",
      free: "Limited",
      analyst: (
        <Cell>
          <span className="text-zinc-400">✓</span>
        </Cell>
      ),
      pro: (
        <Cell>
          <span className="text-zinc-400">✓</span>
        </Cell>
      ),
    },
    {
      name: "Email alerts",
      free: "Limited",
      analyst: (
        <Cell>
          <span className="text-zinc-400">✓</span>
        </Cell>
      ),
      pro: (
        <Cell>
          <span className="text-zinc-400">✓</span>
        </Cell>
      ),
    },
    {
      name: "Publish theses publicly",
      free: <span className="text-zinc-600">—</span>,
      analyst: <span className="text-zinc-600">—</span>,
      pro: (
        <Cell>
          <span className="text-zinc-400">✓</span>
        </Cell>
      ),
    },
    {
      name: "Leaderboard ranking",
      free: <span className="text-zinc-600">—</span>,
      analyst: <span className="text-zinc-600">—</span>,
      pro: (
        <Cell>
          <span className="text-zinc-400">✓</span>
        </Cell>
      ),
    },
    {
      name: "Thesis analytics",
      free: <span className="text-zinc-600">—</span>,
      analyst: <span className="text-zinc-600">—</span>,
      pro: (
        <Cell>
          <span className="text-zinc-400">✓</span>
        </Cell>
      ),
    },
  ];

  return (
    <main className="mx-auto max-w-6xl px-5 py-12 text-zinc-100">
      <div className="flex justify-center">
        <div className="flex items-center justify-center gap-1 rounded-lg border border-white/[0.06] bg-zinc-900/30 p-1">
          <button
            type="button"
            className={cn(
              "rounded-md px-4 py-1.5 text-[13px] font-medium transition-colors",
              billing === "monthly" ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:text-zinc-200",
            )}
            onClick={() => setBilling("monthly")}
          >
            Monthly
          </button>
          <button
            type="button"
            className={cn(
              "rounded-md px-4 py-1.5 text-[13px] font-medium transition-colors",
              billing === "yearly" ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:text-zinc-200",
            )}
            onClick={() => setBilling("yearly")}
          >
            Yearly (2 months free)
          </button>
        </div>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-white/[0.06] bg-zinc-900/30 p-6">
          <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Free</p>
          <p className="mt-2 text-3xl font-semibold text-zinc-50">$0</p>
          <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">
            See how DEPTH4 tracks macro events. Watch a few theses update in real time.
          </p>
          <ul className="mt-4 list-none space-y-2 text-[13px] text-zinc-400">
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
              View limited system theses
            </li>
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
              Limited alerts
            </li>
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
              Community browsing (read-only)
            </li>
          </ul>
          <Link
            href="/signup"
            className="mt-6 block w-full rounded-md bg-zinc-800 py-2 text-center text-[13px] font-medium text-zinc-100 transition-colors hover:bg-zinc-700"
          >
            Create account (Free)
          </Link>
        </div>

        <div className="relative rounded-lg border border-amber-500/30 bg-zinc-900/50 p-6">
          <span className="absolute -top-2 left-4 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-semibold text-zinc-950">
            MOST POPULAR
          </span>
          <p className="text-[10px] uppercase tracking-[0.14em] text-amber-400">Analyst</p>
          <p className="mt-2 text-3xl font-semibold text-zinc-50">{analystPrice}</p>
          <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">
            Track your own macro ideas. Get alerts when news moves your theses.
          </p>
          <ul className="mt-4 list-none space-y-2 text-[13px] text-zinc-400">
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
              Create private theses
            </li>
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
              Full thesis tracking + advisory log
            </li>
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
              Exports
            </li>
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
              Unlimited saved theses
            </li>
          </ul>
          <Link
            href="/signup"
            className="mt-6 block w-full rounded-md bg-amber-500 py-2 text-center text-[13px] font-medium text-zinc-950 transition-colors hover:bg-amber-400"
          >
            Choose Analyst
          </Link>
        </div>

        <div className="rounded-lg border border-white/[0.06] bg-zinc-900/30 p-6">
          <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Pro</p>
          <p className="mt-2 text-3xl font-semibold text-zinc-50">{proPrice}</p>
          <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">
            Share your theses publicly. Build a following based on your track record.
          </p>
          <ul className="mt-4 list-none space-y-2 text-[13px] text-zinc-400">
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
              Publish theses publicly
            </li>
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
              Leaderboard + public profile/followers
            </li>
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
              Fork/remix theses
            </li>
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
              Community participation
            </li>
          </ul>
          <Link
            href="/signup"
            className="mt-6 block w-full rounded-md bg-zinc-800 py-2 text-center text-[13px] font-medium text-zinc-100 transition-colors hover:bg-zinc-700"
          >
            Choose Pro
          </Link>
        </div>
      </div>

      <div className="mt-14">
        <h3 className="text-lg font-semibold tracking-tight text-zinc-50">Comparison</h3>
        <p className="mt-1 text-[12px] text-zinc-500">Annual pricing reflects 2 months free.</p>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-white/[0.06] text-zinc-500 [&_th]:uppercase [&_th]:tracking-wider">
                <th className="py-3 text-left font-medium">Capability</th>
                <th className="py-3 text-center font-medium">Free</th>
                <th className="py-3 text-center font-medium">Analyst</th>
                <th className="py-3 text-center font-medium">Pro</th>
              </tr>
            </thead>
            <tbody className="text-zinc-400">
              {comparisonRows.map((row) => (
                <tr key={row.name} className="border-b border-white/[0.06]">
                  <td className="py-3 text-zinc-300">{row.name}</td>
                  <td className="py-3 text-center">{row.free}</td>
                  <td className="py-3 text-center">{row.analyst}</td>
                  <td className="py-3 text-center">{row.pro}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-10 text-center text-xs text-zinc-600">
        Prices shown in USD. Free tier limits and feature availability may change as DEPTH4 evolves.
      </p>
    </main>
  );
}
