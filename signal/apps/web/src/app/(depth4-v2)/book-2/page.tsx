import type { Metadata } from "next";
import { AppHeader } from "@/components/thesis-engine-v2/AppHeader";
import { ThesisAlertsBell } from "@/components/thesis-engine-v2/ThesisAlertsBell";
import { BookClient } from "@/components/thesis-engine-v2/BookClient";
import { BookHeaderSummary } from "@/components/thesis-engine-v2/BookSessionPerformance";
import { MOCK_POSITIONS, MOCK_RESOLVED_THESES, MOCK_THESES, MOCK_WATCHLIST } from "@/lib/thesis-engine-v2/mock-data";

export const metadata: Metadata = {
  title: "DEPTH4 · Book",
  description: "Your positions, tracked against live macro theses.",
};

export default function Book2Page() {
  const readyCount = MOCK_THESES.filter((t) => t.status === "ready").length;
  const liveLine = `${MOCK_THESES.length} theses tracked · ${readyCount} ready to trade · last update 2 minutes ago`;

  return (
    <>
      <AppHeader active="book" liveLine={liveLine} alertsSlot={<ThesisAlertsBell />} bookSummarySlot={<BookHeaderSummary />} />
      <main className="mx-auto max-w-3xl px-5 pb-14 pt-6">
        <BookClient mockPositions={MOCK_POSITIONS} watchlist={MOCK_WATCHLIST} resolved={MOCK_RESOLVED_THESES} />
      </main>
    </>
  );
}
