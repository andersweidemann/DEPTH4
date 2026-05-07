"use client";

import { useState } from "react";
import { MOCK_LEADERBOARD } from "@/lib/thesis-engine-v2/mock-data";

export function LeaderboardClient() {
  const [timeframe, setTimeframe] = useState<"all" | "6m" | "3m">("all");
  const [category, setCategory] = useState<"all" | "macro" | "equity" | "rates" | "fx" | "commodities">("all");

  // dummy: controls are UI-only; keep stable table
  const rows = MOCK_LEADERBOARD;

  return (
    <>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">DEPTH4</p>
        <h1 className="mt-1 text-lg font-semibold tracking-tight text-zinc-100">Leaderboard</h1>
        <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-zinc-500">
          Rankings update weekly based on thesis accuracy and resolution outcomes. This is a static proof-of-concept.
        </p>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Timeframe</label>
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value as typeof timeframe)}
            className="h-11 rounded-md border border-white/[0.08] bg-zinc-900/30 px-3 text-[16px] font-medium text-zinc-200 outline-none sm:h-9 sm:text-[11px]"
          >
            <option value="all">All-time</option>
            <option value="6m">Last 6 months</option>
            <option value="3m">Last 3 months</option>
          </select>

          <label className="ml-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as typeof category)}
            className="h-11 rounded-md border border-white/[0.08] bg-zinc-900/30 px-3 text-[16px] font-medium text-zinc-200 outline-none sm:h-9 sm:text-[11px]"
          >
            <option value="all">All</option>
            <option value="macro">Macro</option>
            <option value="equity">Equity</option>
            <option value="rates">Rates</option>
            <option value="fx">FX</option>
            <option value="commodities">Commodities</option>
          </select>
        </div>

        <p className="text-[11px] text-zinc-600">Controls are non-functional in the dummy.</p>
      </div>

      <p className="mt-3 text-[11px] text-zinc-600 sm:hidden">Tip: swipe the table to see all columns.</p>
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

