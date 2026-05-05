import type { Metadata } from "next";
import { AppHeader } from "@/components/thesis-engine-v2/AppHeader";
import { FeedSignalCard } from "@/components/thesis-engine-v2/FeedSignalCard";
import { MOCK_FEED_SIGNALS, MOCK_THESES } from "@/lib/thesis-engine-v2/mock-data";

export const metadata: Metadata = {
  title: "DEPTH4 · Feed",
  description: "Incoming macro signals matched into active theses.",
};

export default function Feed2Page() {
  const actionable = MOCK_THESES.filter((t) => t.status === "actionable").length;
  const liveLine = `${MOCK_THESES.length} live theses · ${actionable} actionable · updated 2m ago`;

  return (
    <>
      <AppHeader active="feed" liveLine={liveLine} />
      <main className="mx-auto max-w-3xl px-5 pb-20 pt-10">
        <h1 className="text-lg font-semibold tracking-tight text-zinc-100">Feed</h1>
        <p className="mt-3 max-w-xl text-[12px] leading-relaxed text-zinc-500">
          Incoming macro signals. DEPTH4 matches these into active theses or proposes new ones.
        </p>
        <div className="mt-10 rounded-lg border border-white/[0.06] bg-zinc-900/20 px-4 sm:px-5">
          {MOCK_FEED_SIGNALS.map((item) => (
            <FeedSignalCard key={item.id} item={item} />
          ))}
        </div>
      </main>
    </>
  );
}
