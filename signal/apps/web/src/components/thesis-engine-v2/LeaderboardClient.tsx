"use client";

export function LeaderboardClient() {
  return (
    <>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">DEPTH4</p>
        <h1 className="mt-1 text-lg font-semibold tracking-tight text-zinc-100">Leaderboard</h1>
        <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-zinc-500">
          Accuracy rankings will appear here once outcomes are recorded from real resolutions — not demo win rates or
          follower counts.
        </p>
      </div>

      <div className="mt-8 rounded-lg border border-dashed border-white/[0.08] bg-zinc-900/20 px-5 py-8">
        <p className="text-[13px] font-medium text-zinc-300">Leaderboard not live yet</p>
        <p className="mt-2 max-w-xl text-[12px] leading-relaxed text-zinc-500">
          Wired rankings require a verified source of thesis outcomes and user attribution. Empty beats fabricated stats.
        </p>
      </div>
    </>
  );
}
