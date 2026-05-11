import type { Metadata } from "next";
import { LeaderboardClient } from "@/components/thesis-engine-v2/LeaderboardClient";
import { thesesLiveHeaderNeutral } from "@/lib/thesis-engine-v2/live-header-copy";

export const metadata: Metadata = {
  title: "DEPTH4 · Leaderboard",
  description: "Thesis accuracy rankings and resolution outcomes.",
};

export default function LeaderboardPage() {
  const liveLine = thesesLiveHeaderNeutral();

  return (
    <>
      {liveLine.trim() ? (
        <p className="mb-4 text-[12px] leading-snug text-zinc-500 sm:text-[11px]">{liveLine}</p>
      ) : null}
      <div className="pb-12 pt-2">
        <LeaderboardClient />
      </div>
    </>
  );
}
