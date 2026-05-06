"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ThesisCard } from "@/components/thesis-engine-v2/ThesisCard";
import { LiveSignalTicker } from "@/components/thesis-engine-v2/LiveSignalTicker";
import { ActionablePing } from "@/components/thesis-engine-v2/ActionablePing";
import { CreateThesisModal } from "@/components/thesis-engine-v2/CreateThesisModal";
import { UpgradeModal } from "@/components/thesis-engine-v2/UpgradeModal";
import type { LiveSignalTickerItem, Thesis } from "@/lib/thesis-engine-v2/types";
import { getThesisDetail, isEmerging, isTradeable, sortThesesForDashboard } from "@/lib/thesis-engine-v2/mock-data";
import { loadUserTheses, upsertUserThesis } from "@/lib/thesis-engine-v2/user-theses";
import { canUse } from "@/lib/thesis-engine-v2/plan";
import { useV2Plan } from "@/lib/thesis-engine-v2/use-plan";

type AssetClass = "all" | "equity" | "rates" | "fx" | "commodities" | "crypto";
type SortKey = "recent" | "probability" | "biggest_move";

function parseRelativeMinutes(s: string): number {
  const t = (s || "").toLowerCase().trim();
  if (!t) return Number.POSITIVE_INFINITY;
  if (t.includes("just now")) return 0;
  const m = t.match(/(\d+)\s*m/);
  if (m) return Number(m[1]);
  const h = t.match(/(\d+)\s*h/);
  if (h) return Number(h[1]) * 60;
  const d = t.match(/(\d+)\s*d/);
  if (d) return Number(d[1]) * 60 * 24;
  return Number.POSITIVE_INFINITY;
}

function assetClassFor(thesis: Thesis): AssetClass {
  const a = (thesis.asset || "").toUpperCase();
  if (a.includes("BTC") || a.includes("ETH")) return "crypto";
  if (a.includes("USD") && (a.length === 6 || a.includes("EUR") || a.includes("JPY") || a.includes("GBP"))) return "fx";
  if (a.includes("XAU") || a.includes("OIL") || a.includes("HG") || a.includes("CL")) return "commodities";
  if (a === "TLT" || a.includes("UST") || a.includes("BOND")) return "rates";
  return "equity";
}

export function ThesesDashboardClient({
  systemTheses,
  liveSignals,
}: {
  systemTheses: Thesis[];
  liveSignals: LiveSignalTickerItem[];
}) {
  const { plan } = useV2Plan();
  const [open, setOpen] = useState(false);
  const [userTheses, setUserTheses] = useState<Thesis[]>([]);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [show, setShow] = useState<"all" | "actionable">("all");
  const [assetClass, setAssetClass] = useState<AssetClass>("all");
  const [sortKey, setSortKey] = useState<SortKey>("recent");

  useEffect(() => {
    setUserTheses(loadUserTheses());
  }, []);

  const sorted = useMemo(() => sortThesesForDashboard([...systemTheses, ...userTheses]), [systemTheses, userTheses]);
  const moveBySlug = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of sorted) {
      const b = getThesisDetail(t.slug);
      const ev = b?.evidence?.[0];
      if (!ev) {
        m.set(t.slug, 0);
        continue;
      }
      m.set(t.slug, Math.abs(ev.probabilityAfter - ev.probabilityBefore));
    }
    return m;
  }, [sorted]);

  const filtered = useMemo(() => {
    let list = sorted;
    if (show === "actionable") list = list.filter((t) => t.status === "actionable");
    if (assetClass !== "all") list = list.filter((t) => assetClassFor(t) === assetClass);

    const next = [...list];
    next.sort((a, b) => {
      if (sortKey === "probability") return b.probability - a.probability;
      if (sortKey === "biggest_move") return (moveBySlug.get(b.slug) ?? 0) - (moveBySlug.get(a.slug) ?? 0);
      return parseRelativeMinutes(a.lastUpdated) - parseRelativeMinutes(b.lastUpdated);
    });
    return next;
  }, [assetClass, moveBySlug, show, sortKey, sorted]);

  const tradeable = useMemo(() => filtered.filter(isTradeable), [filtered]);
  const emerging = useMemo(() => filtered.filter(isEmerging), [filtered]);

  return (
    <>
      <LiveSignalTicker items={liveSignals} intervalMs={12_000} />
      <ActionablePing theses={sorted} />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">DEPTH4</p>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-zinc-100">Live theses</h1>
          <p className="mt-1 max-w-md text-[12px] leading-relaxed text-zinc-500">
            Tracks macro events the market hasn&apos;t priced in yet.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
            Analyst feature
          </span>
          <button
            type="button"
            className="rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold text-amber-200/90 hover:bg-amber-500/15"
            onClick={() => {
              if (!canUse(plan, "createPrivateTheses")) {
                setUpgradeOpen(true);
                return;
              }
              setOpen(true);
            }}
          >
            + New thesis
          </button>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-zinc-900/20 p-1">
          <button
            type="button"
            className={[
              "rounded-md px-3 py-1.5 text-[11px] font-semibold",
              show === "all" ? "bg-zinc-900/60 text-zinc-100" : "text-zinc-500 hover:text-zinc-300",
            ].join(" ")}
            onClick={() => setShow("all")}
          >
            All theses
          </button>
          <button
            type="button"
            className={[
              "rounded-md px-3 py-1.5 text-[11px] font-semibold",
              show === "actionable" ? "bg-zinc-900/60 text-zinc-100" : "text-zinc-500 hover:text-zinc-300",
            ].join(" ")}
            onClick={() => setShow("actionable")}
          >
            Actionable only
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Asset class</label>
          <select
            value={assetClass}
            onChange={(e) => setAssetClass(e.target.value as AssetClass)}
            className="h-9 rounded-md border border-white/[0.08] bg-zinc-900/30 px-3 text-[11px] font-medium text-zinc-200 outline-none ring-0"
          >
            <option value="all">All</option>
            <option value="equity">Equity</option>
            <option value="rates">Rates</option>
            <option value="fx">FX</option>
            <option value="commodities">Commodities</option>
            <option value="crypto">Crypto</option>
          </select>

          <label className="ml-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Sort</label>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="h-9 rounded-md border border-white/[0.08] bg-zinc-900/30 px-3 text-[11px] font-medium text-zinc-200 outline-none ring-0"
          >
            <option value="recent">Most recent update</option>
            <option value="probability">Highest probability</option>
            <option value="biggest_move">Biggest move</option>
          </select>
        </div>
      </div>

      <div className="mt-10 flex flex-col gap-4">
        {tradeable.map((thesis) => (
          <ThesisCard key={thesis.id} thesis={thesis} />
        ))}
      </div>

      {emerging.length > 0 && (
        <section className="mt-14">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Forming ideas</h2>
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

      <UpgradeModal
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        requiredPlan="analyst"
        featureLabel="Create private theses"
        onUpgraded={() => {
          setOpen(true);
        }}
      />
    </>
  );
}

