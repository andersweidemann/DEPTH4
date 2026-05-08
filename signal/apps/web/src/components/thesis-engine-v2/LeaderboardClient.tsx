"use client";

import { MOCK_LEADERBOARD } from "@/lib/thesis-engine-v2/mock-data";

export function LeaderboardClient() {
  const rows = MOCK_LEADERBOARD;

  return (
    <>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">DEPTH4</p>
        <h1 className="mt-1 text-lg font-semibold tracking-tight text-zinc-100">Leaderboard</h1>
        <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-zinc-500">
          Rankings reflect thesis accuracy, resolutions, and community engagement. Figures update as new outcomes are
          recorded.
        </p>
      </div>

      <p className="mt-6 text-[11px] text-zinc-600 sm:hidden">Tip: swipe the table to see all columns.</p>
      <div className="mt-8 overflow-x-auto rounded-none bg-zinc-900/20">
        <table className="w-full min-w-[560px] text-left">
          <thead className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            <tr className="border-b border-white/[0.06]">
              <th className="px-4 py-3">Rank</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Win rate</th>
              <th className="px-4 py-3">Resolved</th>
              <th className="px-4 py-3">Avg thesis score</th>
              <th className="px-4 py-3">Followers</th>
            </tr>
          </thead>
          <tbody className="text-[12px] text-zinc-300">
            {rows.map((u) => (
              <tr key={u.id} className="border-b border-white/[0.05] last:border-0">
                <td className="px-4 py-3 tabular-nums text-zinc-400">{u.rank}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-zinc-100">{u.name}</span>
                    <span className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                      {u.badge}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 tabular-nums">{u.winRate}</td>
                <td className="px-4 py-3 tabular-nums">{u.resolvedCount}</td>
                <td className="px-4 py-3 tabular-nums text-zinc-400">{u.avgScore}</td>
                <td className="px-4 py-3 tabular-nums">{u.followers.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
