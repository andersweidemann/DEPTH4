import type { Metadata } from "next";
import { AppHeader } from "@/components/thesis-engine-v2/AppHeader";
import { ThesisAlertsBell } from "@/components/thesis-engine-v2/ThesisAlertsBell";
import { ThesesDashboardClient } from "@/components/thesis-engine-v2/ThesesDashboardClient";
import { MOCK_THESES } from "@/lib/thesis-engine-v2/mock-data";

export const metadata: Metadata = {
  title: "DEPTH4 · Live theses",
  description: "Tracks macro events the market hasn't priced in yet.",
};

export default function ThesesDashboardPage() {
  const readyCount = MOCK_THESES.filter((t) => t.status === "ready").length;
  const liveLine = `${MOCK_THESES.length} theses tracked · ${readyCount} ready to trade · last update 2 minutes ago`;

  return (
    <>
      <AppHeader active="theses" liveLine={liveLine} alertsSlot={<ThesisAlertsBell />} />
      <main className="mx-auto max-w-3xl px-5 pb-20 pt-6">
        <ThesesDashboardClient systemTheses={MOCK_THESES} />
      </main>
    </>
  );
}
