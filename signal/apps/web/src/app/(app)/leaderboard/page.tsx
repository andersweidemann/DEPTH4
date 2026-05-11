import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DEPTH4 · Leaderboard",
  description: "Thesis accuracy rankings and resolution outcomes.",
};

export default function LeaderboardPage() {
  return (
    <div className="py-20 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Leaderboard</p>
      <h1 className="mt-2 text-xl font-semibold tracking-tight text-zinc-50">Leaderboard</h1>
      <p className="mt-3 text-[13px] text-zinc-400">Not live yet.</p>
      <p className="mt-1 text-[12px] text-zinc-500">
        When it launches, this is where public thesis performance rankings will appear.
      </p>
    </div>
  );
}
