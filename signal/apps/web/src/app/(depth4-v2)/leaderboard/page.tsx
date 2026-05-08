import type { Metadata } from "next";
import { AppHeader } from "@/components/thesis-engine-v2/AppHeader";
import { ThesisAlertsBell } from "@/components/thesis-engine-v2/ThesisAlertsBell";
import { LeaderboardClient } from "@/components/thesis-engine-v2/LeaderboardClient";
import { thesesLiveLine } from "@/lib/thesis-engine-v2/live-header-copy";
import { MOCK_THESES } from "@/lib/thesis-engine-v2/mock-data";

export const metadata: Metadata = {
  title: "DEPTH4 · Leaderboard",
  description: "Thesis accuracy rankings and resolution outcomes.",
};

export default function LeaderboardPage() {
  const readyCount = MOCK_THESES.filter((t) => t.status === "ready").length;
  const liveLine = thesesLiveLine(readyCount, MOCK_THESES.length);

  return (
    <>
      <AppHeader active="leaderboard" liveLine={liveLine} alertsSlot={<ThesisAlertsBell />} />
      <main className="mx-auto max-w-3xl px-5 pb-20 pt-10">
        <LeaderboardClient />
      </main>
    </>
  );
}

