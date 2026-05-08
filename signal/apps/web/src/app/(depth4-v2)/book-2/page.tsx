import type { Metadata } from "next";
import { AppHeader } from "@/components/thesis-engine-v2/AppHeader";
import { ThesisAlertsBell } from "@/components/thesis-engine-v2/ThesisAlertsBell";
import { BookClient } from "@/components/thesis-engine-v2/BookClient";
import { BookHeaderSummary } from "@/components/thesis-engine-v2/BookSessionPerformance";
import { thesesLiveHeaderNeutral } from "@/lib/thesis-engine-v2/live-header-copy";

export const metadata: Metadata = {
  title: "DEPTH4 · Book",
  description: "Your positions, tracked against live macro theses.",
};

export default function Book2Page() {
  const liveLine = thesesLiveHeaderNeutral();

  return (
    <>
      <AppHeader active="book" liveLine={liveLine} alertsSlot={<ThesisAlertsBell />} bookSummarySlot={<BookHeaderSummary />} />
      <main className="mx-auto max-w-3xl px-5 pb-14 pt-6">
        <BookClient watchlist={[]} resolved={[]} />
      </main>
    </>
  );
}
