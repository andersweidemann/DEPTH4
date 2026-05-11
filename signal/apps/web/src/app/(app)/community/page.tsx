import type { Metadata } from "next";
import { thesesLiveHeaderNeutral } from "@/lib/thesis-engine-v2/live-header-copy";

export const metadata: Metadata = {
  title: "DEPTH4 · Community",
  description: "Published theses from the DEPTH4 community.",
};

export default function CommunityPage() {
  const liveLine = thesesLiveHeaderNeutral();

  return (
    <>
      {liveLine.trim() ? (
        <p className="mb-4 text-[12px] leading-snug text-zinc-500 sm:text-[11px]">{liveLine}</p>
      ) : null}
      <div className="pb-12 pt-2">
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
      </div>
    </>
  );
}
