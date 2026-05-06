import type { Metadata } from "next";
import { AppHeader } from "@/components/thesis-engine-v2/AppHeader";
import { ThesisCard } from "@/components/thesis-engine-v2/ThesisCard";
import { LiveSignalTicker } from "@/components/thesis-engine-v2/LiveSignalTicker";
import { MOCK_LIVE_SIGNAL_TICKER, MOCK_THESES, isEmerging, isTradeable, sortThesesForDashboard } from "@/lib/thesis-engine-v2/mock-data";
import Link from "next/link";

export const metadata: Metadata = {
  title: "DEPTH4 · Live theses",
  description: "Tracks unpriced macro narratives before the market catches up.",
};

export default function ThesesDashboardPage() {
  const sorted = sortThesesForDashboard(MOCK_THESES);
  const tradeable = sorted.filter(isTradeable);
  const emerging = sorted.filter(isEmerging);
  const actionable = tradeable.filter((t) => t.status === "actionable").length;
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

        <LiveSignalTicker items={MOCK_LIVE_SIGNAL_TICKER} intervalMs={12_000} />

        <div className="mt-10 flex flex-col gap-4">
          {tradeable.map((thesis) => (
            <ThesisCard key={thesis.id} thesis={thesis} />
          ))}
        </div>

        {emerging.length > 0 && (
          <section className="mt-14">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                  Emerging theses
                </h2>
                <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
                  Narrative forming — not compressed enough to trade yet.
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-white/[0.06] bg-zinc-900/20 px-4 sm:px-5">
              {emerging.map((t) => (
                <Link
                  key={t.id}
                  href={`/theses/${t.slug}`}
                  className="block border-b border-white/[0.05] py-4 last:border-0"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-[12px] font-medium text-zinc-200">{t.title}</span>
                    <span className="text-[11px] tabular-nums text-zinc-500">
                      {t.probability}% · score {t.scores.total}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-500">
                    <span className="text-zinc-600">Market misread · </span>
                    {t.marketMisread}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  );
}
