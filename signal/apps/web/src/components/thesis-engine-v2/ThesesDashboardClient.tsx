"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ThesisCard } from "@/components/thesis-engine-v2/ThesisCard";
import { LiveSignalTicker } from "@/components/thesis-engine-v2/LiveSignalTicker";
import { CreateThesisModal } from "@/components/thesis-engine-v2/CreateThesisModal";
import type { LiveSignalTickerItem, Thesis } from "@/lib/thesis-engine-v2/types";
import { isEmerging, isTradeable, sortThesesForDashboard } from "@/lib/thesis-engine-v2/mock-data";
import { loadUserTheses, upsertUserThesis } from "@/lib/thesis-engine-v2/user-theses";

export function ThesesDashboardClient({
  systemTheses,
  liveSignals,
}: {
  systemTheses: Thesis[];
  liveSignals: LiveSignalTickerItem[];
}) {
  const [open, setOpen] = useState(false);
  const [userTheses, setUserTheses] = useState<Thesis[]>([]);

  useEffect(() => {
    setUserTheses(loadUserTheses());
  }, []);

  const sorted = useMemo(() => sortThesesForDashboard([...systemTheses, ...userTheses]), [systemTheses, userTheses]);
  const tradeable = useMemo(() => sorted.filter(isTradeable), [sorted]);
  const emerging = useMemo(() => sorted.filter(isEmerging), [sorted]);

  return (
    <>
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
          className="rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold text-amber-200/90 hover:bg-amber-500/15"
          onClick={() => setOpen(true)}
        >
          + New thesis
        </button>
      </div>

      <LiveSignalTicker items={liveSignals} intervalMs={12_000} />

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
                Forming narratives
              </h2>
              <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
                Real drivers, not enough timing compression yet.
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

      <CreateThesisModal
        open={open}
        onOpenChange={setOpen}
        onCreate={(t) => {
          const next = upsertUserThesis(t);
          setUserTheses(next);
        }}
      />
    </>
  );
}

