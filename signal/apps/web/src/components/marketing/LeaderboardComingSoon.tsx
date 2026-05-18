"use client";

import { WaitlistCapture } from "@/components/marketing/WaitlistCapture";

export function LeaderboardComingSoon() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Leaderboard</p>
      <h1 className="mt-2 text-xl font-semibold tracking-tight text-zinc-100">Coming soon</h1>
      <p className="mt-2 max-w-md text-[13px] leading-relaxed text-zinc-400">
        Rankings based on thesis win rates, conviction accuracy, and risk-adjusted returns. Prove your edge.
      </p>
      <p className="mt-1 text-[11px] text-zinc-500">Requires resolved theses with outcomes to generate rankings.</p>

      <div className="mt-6 w-full max-w-md rounded-lg border border-white/[0.06] bg-zinc-900/30 p-4 text-left">
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
