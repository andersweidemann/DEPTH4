"use client";

import { WaitlistCapture } from "@/components/marketing/WaitlistCapture";

const RANK_CARDS = [
  {
    title: "Most accurate",
    body: "Highest win rate on resolved theses with logged outcomes.",
  },
  {
    title: "Best edge",
    body: "Best risk-adjusted analysis quality on closed hypotheses.",
  },
  {
    title: "Most active",
    body: "Most theses created, tracked, and updated over time.",
  },
] as const;

export function LeaderboardComingSoon() {
  return (
    <div className="mx-auto max-w-3xl pb-16 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Leaderboard</p>
      <h1 className="mt-2 text-xl font-semibold tracking-tight text-zinc-100">Coming soon</h1>
      <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-zinc-400">
        Track the best-performing thesis creators and most accurate scenario reads once outcomes accumulate.
      </p>
      <p className="mt-1 text-[11px] text-zinc-500">Requires resolved theses with outcomes to generate rankings.</p>

      <div className="mt-8 grid gap-4 text-left md:grid-cols-3">
        {RANK_CARDS.map((card) => (
          <div key={card.title} className="rounded-lg border border-white/[0.08] bg-zinc-900/30 p-6">
            <h3 className="text-[13px] font-medium text-zinc-100">{card.title}</h3>
            <p className="mt-2 text-[12px] leading-relaxed text-zinc-500">{card.body}</p>
          </div>
        ))}
      </div>

      <div className="mx-auto mt-6 w-full max-w-md rounded-lg border border-white/[0.06] bg-zinc-900/30 p-4 text-left">
        <p className="mb-2 text-[10px] uppercase tracking-[0.14em] text-zinc-600">Preview</p>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="w-4 text-[11px] text-amber-400">1</span>
            <span className="text-[12px] text-zinc-300">DEPTH4 System</span>
            <span className="ml-auto text-[11px] text-emerald-400">80% win rate</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-4 text-[11px] text-zinc-500">2</span>
            <span className="text-[12px] text-zinc-400">You</span>
            <span className="ml-auto text-[11px] text-zinc-500">Start resolving theses</span>
          </div>
        </div>
      </div>

      <WaitlistCapture list="leaderboard" />
    </div>
  );
}
