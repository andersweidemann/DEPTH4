import type { Metadata } from "next";
import { BookClient } from "@/components/thesis-engine-v2/BookClient";
import { BookHeaderSummary } from "@/components/thesis-engine-v2/BookSessionPerformance";
import { thesesLiveHeaderNeutral } from "@/lib/thesis-engine-v2/live-header-copy";

export const metadata: Metadata = {
  title: "DEPTH4 · Book",
  description: "Your positions, tracked against live macro theses.",
};

export default function BookPage() {
  const liveLine = thesesLiveHeaderNeutral();

  return (
    <>
      {liveLine.trim() ? (
        <p className="mb-4 text-[12px] leading-snug text-zinc-500 sm:text-[11px]">{liveLine}</p>
      ) : null}
      <div className="mb-4">
        <BookHeaderSummary />
      </div>
      <div className="pb-10 pt-2">
        <BookClient watchlist={[]} resolved={[]} />
      </div>
    </>
  );
}
