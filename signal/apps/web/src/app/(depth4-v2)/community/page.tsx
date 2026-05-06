import type { Metadata } from "next";
import { AppHeader } from "@/components/thesis-engine-v2/AppHeader";
import { CommunityThesisCard } from "@/components/thesis-engine-v2/CommunityThesisCard";
import { MOCK_COMMUNITY_THESES, MOCK_THESES } from "@/lib/thesis-engine-v2/mock-data";

export const metadata: Metadata = {
  title: "DEPTH4 · Community",
  description: "Published theses from the community (dummy).",
};

export default function CommunityPage() {
  const actionable = MOCK_THESES.filter((t) => t.status === "actionable").length;
  const liveLine = `${MOCK_THESES.length} live theses · ${actionable} actionable · updated 2m ago`;

  return (
    <>
      <AppHeader active="community" liveLine={liveLine} />
      <main className="mx-auto max-w-3xl px-5 pb-20 pt-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">DEPTH4</p>
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

