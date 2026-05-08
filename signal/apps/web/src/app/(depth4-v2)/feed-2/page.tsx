import type { Metadata } from "next";
import { AppHeader } from "@/components/thesis-engine-v2/AppHeader";
import { ThesisAlertsBell } from "@/components/thesis-engine-v2/ThesisAlertsBell";
import { FeedSignalCard } from "@/components/thesis-engine-v2/FeedSignalCard";
import { thesesLiveLine } from "@/lib/thesis-engine-v2/live-header-copy";
import { MOCK_FEED_SIGNALS, MOCK_THESES } from "@/lib/thesis-engine-v2/mock-data";

export const metadata: Metadata = {
  title: "DEPTH4 · Feed",
  description: "Incoming macro signals matched into active theses.",
};

export default function Feed2Page() {
  const readyCount = MOCK_THESES.filter((t) => t.status === "ready").length;
  const activeCount = MOCK_THESES.filter((t) => t.status === "active").length;
  const liveLine = thesesLiveLine(readyCount, MOCK_THESES.length);

  return (
    <>
      <AppHeader active="feed" liveLine={liveLine} alertsSlot={<ThesisAlertsBell />} />
      <main className="mx-auto max-w-5xl px-5 pb-20 pt-10">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <section>
            <h1 className="text-lg font-semibold tracking-tight text-zinc-100">Feed</h1>
            <p className="mt-3 max-w-2xl text-[12px] leading-relaxed text-zinc-500">
              Incoming macro signals. DEPTH4 matches these into active theses or proposes new ones.
            </p>
            <div className="mt-10 rounded-lg border border-white/[0.06] bg-zinc-900/20 px-4 sm:px-5">
              {MOCK_FEED_SIGNALS.map((item) => (
                <FeedSignalCard key={item.id} item={item} />
              ))}
            </div>
          </section>

          <aside className="hidden lg:block">
            <div className="rounded-lg border border-white/[0.06] bg-zinc-900/15 px-4 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Active theses</p>
              <p className="mt-2 text-[12px] leading-relaxed text-zinc-400">
                {activeCount} active · {readyCount} ready
              </p>
              <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
                The feed surfaces headlines that map cleanly to a thesis first. Unlinked items are shown when no system
                thesis is a clear match yet.
              </p>
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}
