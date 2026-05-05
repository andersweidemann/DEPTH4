import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/thesis-engine-v2/AppHeader";
import { PositionRow } from "@/components/thesis-engine-v2/PositionRow";
import { MOCK_POSITIONS, MOCK_THESES, MOCK_WATCHLIST } from "@/lib/thesis-engine-v2/mock-data";

export const metadata: Metadata = {
  title: "DEPTH4 · Book",
  description: "Your positions, tracked against live macro theses.",
};

export default function Book2Page() {
  const actionable = MOCK_THESES.filter((t) => t.status === "actionable").length;
  const liveLine = `${MOCK_THESES.length} live theses · ${actionable} actionable · updated 2m ago`;

  return (
    <>
      <AppHeader active="book" liveLine={liveLine} />
      <main className="mx-auto max-w-3xl px-5 pb-20 pt-10">
        <h1 className="text-lg font-semibold tracking-tight text-zinc-100">Book</h1>
        <p className="mt-3 text-[12px] leading-relaxed text-zinc-500">
          Your positions, tracked against live macro theses.
        </p>
        <div className="mt-10">
          {MOCK_POSITIONS.map((p) => (
            <PositionRow key={p.id} position={p} />
          ))}
        </div>
        <section className="mt-14">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Watchlist (no position attached yet)
          </h2>
          <ul className="mt-4 space-y-3">
            {MOCK_WATCHLIST.map((w) => (
              <li
                key={w.id}
                className="rounded-lg border border-white/[0.06] bg-zinc-900/25 px-4 py-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-mono text-sm text-zinc-200">{w.symbol}</span>
                  <Link
                    href={`/theses/${w.thesisSlug}`}
                    className="text-[11px] font-medium text-amber-500/85 hover:text-amber-400"
                  >
                    {w.thesisTitle}
                  </Link>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">{w.note}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}
