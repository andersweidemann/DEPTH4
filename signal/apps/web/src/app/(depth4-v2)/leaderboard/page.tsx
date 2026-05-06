import type { Metadata } from "next";
import { AppHeader } from "@/components/thesis-engine-v2/AppHeader";
import { MOCK_LEADERBOARD, MOCK_THESES } from "@/lib/thesis-engine-v2/mock-data";

export const metadata: Metadata = {
  title: "DEPTH4 · Leaderboard",
  description: "Rankings update weekly based on thesis accuracy (dummy).",
};

export default function LeaderboardPage() {
  const actionable = MOCK_THESES.filter((t) => t.status === "actionable").length;
  const liveLine = `${MOCK_THESES.length} live theses · ${actionable} actionable · updated 2m ago`;

  return (
    <>
      <AppHeader active="leaderboard" liveLine={liveLine} />
      <main className="mx-auto max-w-3xl px-5 pb-20 pt-10">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">DEPTH4</p>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-zinc-100">Leaderboard</h1>
          <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-zinc-500">
            Rankings update weekly based on thesis accuracy. This is a static proof-of-concept.
          </p>
        </div>

        <div className="mt-10 overflow-x-auto rounded-lg border border-white/[0.06] bg-zinc-900/20">
          <table className="w-full min-w-[560px] text-left">
            <thead className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              <tr className="border-b border-white/[0.06]">
                <th className="px-4 py-3">Rank</th>
                <th className="px-4 py-3">Trader</th>
                <th className="px-4 py-3">Win rate</th>
                <th className="px-4 py-3">Resolved</th>
                <th className="px-4 py-3">Followers</th>
              </tr>
            </thead>
            <tbody className="text-[12px] text-zinc-300">
              {MOCK_LEADERBOARD.map((u) => (
                <tr key={u.id} className="border-b border-white/[0.05] last:border-0">
                  <td className="px-4 py-3 tabular-nums text-zinc-400">{u.rank}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-zinc-100">{u.name}</span>
                      <span className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-white/[0.08] bg-zinc-900/40 text-zinc-300">
                        {u.badge}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{u.winRate}</td>
                  <td className="px-4 py-3 tabular-nums">{u.resolvedCount}</td>
                  <td className="px-4 py-3 tabular-nums">{u.followers.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}

