import type { Metadata } from "next";
import { AppHeader } from "@/components/thesis-engine-v2/AppHeader";
import { ThesisAlertsBell } from "@/components/thesis-engine-v2/ThesisAlertsBell";
import { thesesLiveHeaderNeutral } from "@/lib/thesis-engine-v2/live-header-copy";

export const metadata: Metadata = {
  title: "DEPTH4 · Community",
  description: "Published theses from the DEPTH4 community.",
};

export default function CommunityPage() {
  const liveLine = thesesLiveHeaderNeutral();

  return (
    <>
      <AppHeader active="community" liveLine={liveLine} alertsSlot={<ThesisAlertsBell />} />
      <main className="mx-auto max-w-3xl px-5 pb-20 pt-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="mt-1 text-lg font-semibold tracking-tight text-zinc-100">Community</h1>
            <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-zinc-500">
              Browse published theses from other traders once community publishing ships.
            </p>
          </div>
        </div>

        <div className="mt-10 rounded-lg border border-dashed border-white/[0.08] bg-zinc-900/20 px-5 py-8">
          <p className="text-[13px] font-medium text-zinc-300">Community feed not live yet</p>
          <p className="mt-2 max-w-xl text-[12px] leading-relaxed text-zinc-500">
            Rankings and shared thesis cards will appear here when backed by real profiles and resolutions — no placeholder
            probabilities or scores.
          </p>
        </div>
      </main>
    </>
  );
}

