import type { Metadata } from "next";
import { AppHeader } from "@/components/thesis-engine-v2/AppHeader";
import { ThesesDashboardClient } from "@/components/thesis-engine-v2/ThesesDashboardClient";
import { MOCK_LIVE_SIGNAL_TICKER, MOCK_THESES } from "@/lib/thesis-engine-v2/mock-data";

export const metadata: Metadata = {
  title: "DEPTH4 · Live theses",
  description: "Tracks macro events the market hasn't priced in yet.",
};

export default function ThesesDashboardPage() {
  const actionable = MOCK_THESES.filter((t) => t.status === "actionable").length;
  const liveLine = `${MOCK_THESES.length} live theses · ${actionable} actionable · updated 2m ago`;

  return (
    <>
      <AppHeader active="theses" liveLine={liveLine} />
      <main className="mx-auto max-w-3xl px-5 pb-20 pt-10">
        <ThesesDashboardClient systemTheses={MOCK_THESES} liveSignals={MOCK_LIVE_SIGNAL_TICKER} />
      </main>
    </>
  );
}
