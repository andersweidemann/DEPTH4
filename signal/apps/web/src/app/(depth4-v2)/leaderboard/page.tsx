import type { Metadata } from "next";
import { AppHeader } from "@/components/thesis-engine-v2/AppHeader";
import { LeaderboardClient } from "@/components/thesis-engine-v2/LeaderboardClient";
import { MOCK_THESES } from "@/lib/thesis-engine-v2/mock-data";

export const metadata: Metadata = {
  title: "DEPTH4 · Leaderboard",
  description: "Rankings update weekly based on thesis accuracy (dummy).",
};

export default function LeaderboardPage() {
  const actionable = MOCK_THESES.filter((t) => t.status === "actionable").length;
  const liveLine = `${MOCK_THESES.length} theses tracked · ${actionable} ready to trade · last update 2 minutes ago`;

  return (
    <>
      <AppHeader active="leaderboard" liveLine={liveLine} />
      <main className="mx-auto max-w-3xl px-5 pb-20 pt-10">
        <LeaderboardClient />
      </main>
    </>
  );
}

