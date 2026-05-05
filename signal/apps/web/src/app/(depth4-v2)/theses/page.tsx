import type { Metadata } from "next";
import { AppHeader } from "@/components/thesis-engine-v2/AppHeader";
import { ThesisCard } from "@/components/thesis-engine-v2/ThesisCard";
import { MOCK_THESES, sortThesesForDashboard } from "@/lib/thesis-engine-v2/mock-data";

export const metadata: Metadata = {
  title: "DEPTH4 · Live theses",
  description: "Tracks unpriced macro narratives before the market catches up.",
};

export default function ThesesDashboardPage() {
  const sorted = sortThesesForDashboard(MOCK_THESES);
  const actionable = MOCK_THESES.filter((t) => t.status === "actionable").length;
  const liveLine = `${MOCK_THESES.length} live theses · ${actionable} actionable · updated 2m ago`;

  return (
    <>
      <AppHeader active="theses" liveLine={liveLine} />
      <main className="mx-auto max-w-3xl px-5 pb-20 pt-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">DEPTH4</p>
            <h1 className="mt-1 text-lg font-semibold tracking-tight text-zinc-100">Live theses</h1>
            <p className="mt-1 max-w-md text-[12px] leading-relaxed text-zinc-500">
              Tracks unpriced macro narratives before the market catches up.
            </p>
          </div>
          <button
            type="button"
            className="rounded-md border border-white/[0.08] bg-zinc-900/50 px-3 py-1.5 text-[11px] font-medium text-zinc-400"
            disabled
            title="Prototype — not wired yet"
          >
            + New thesis
          </button>
        </div>
        <div className="mt-10 flex flex-col gap-4">
          {sorted.map((thesis) => (
            <ThesisCard key={thesis.id} thesis={thesis} />
          ))}
        </div>
      </main>
    </>
  );
}
