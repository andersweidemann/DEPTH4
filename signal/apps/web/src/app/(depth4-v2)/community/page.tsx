import type { Metadata } from "next";
import { AppHeader } from "@/components/thesis-engine-v2/AppHeader";
import { ThesisAlertsBell } from "@/components/thesis-engine-v2/ThesisAlertsBell";
import { CommunityThesisCard } from "@/components/thesis-engine-v2/CommunityThesisCard";
import { MOCK_COMMUNITY_THESES, MOCK_THESES } from "@/lib/thesis-engine-v2/mock-data";
import { Depth4Wordmark } from "@/components/brand/Depth4Wordmark";

export const metadata: Metadata = {
  title: "DEPTH4 · Community",
  description: "Published theses from the community (dummy).",
};

export default function CommunityPage() {
  const readyCount = MOCK_THESES.filter((t) => t.status === "ready").length;
  const liveLine = `${MOCK_THESES.length} theses tracked · ${readyCount} ready to trade · last update 2 minutes ago`;

  return (
    <>
      <AppHeader active="community" liveLine={liveLine} alertsSlot={<ThesisAlertsBell />} />
      <main className="mx-auto max-w-3xl px-5 pb-20 pt-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Depth4Wordmark href="/theses" size="sm" />
            <h1 className="mt-1 text-lg font-semibold tracking-tight text-zinc-100">Community</h1>
            <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-zinc-500">
              Published theses from other traders. Follow thinkers with repeatable accuracy.
            </p>
          </div>
          <p className="text-[11px] text-zinc-600">Read-only on Free · Pro unlocks publishing (dummy)</p>
        </div>

        <div className="mt-10 grid gap-4">
          {MOCK_COMMUNITY_THESES.map((t) => (
            <CommunityThesisCard key={t.id} item={t} />
          ))}
        </div>
      </main>
    </>
  );
}

