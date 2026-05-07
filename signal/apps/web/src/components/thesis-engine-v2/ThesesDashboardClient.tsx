"use client";

import { useEffect, useMemo, useState } from "react";
import { ThesisCard } from "@/components/thesis-engine-v2/ThesisCard";
import { ThesisTableRow } from "@/components/thesis-engine-v2/ThesisTableRow";
import { LiveSignalTicker } from "@/components/thesis-engine-v2/LiveSignalTicker";
import { CreateThesisModal } from "@/components/thesis-engine-v2/CreateThesisModal";
import { UpgradeModal } from "@/components/thesis-engine-v2/UpgradeModal";
import { ThesisDetailDrawer } from "@/components/thesis-engine-v2/ThesisDetailDrawer";
import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { getThesisDetail, sortThesesForDashboard } from "@/lib/thesis-engine-v2/mock-data";
import { loadUserTheses, upsertUserThesis } from "@/lib/thesis-engine-v2/user-theses";
import { canUse } from "@/lib/thesis-engine-v2/plan";
import { useThesisLive } from "@/lib/thesis-engine-v2/thesis-live-context";
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
  initialDrawerSlug = null,
}: {
  systemTheses: Thesis[];
  /** From `/theses?openDrawer=<slug>` (server). */
  initialDrawerSlug?: string | null;
}) {
  const live = useThesisLive();
  const { plan } = useV2Plan();
  const [open, setOpen] = useState(false);
  const [userTheses, setUserTheses] = useState<Thesis[]>([]);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [show, setShow] = useState<"all" | "ready">("all");
  const [assetClass, setAssetClass] = useState<AssetClass>("all");
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [drawerSlug, setDrawerSlug] = useState<string | null>(initialDrawerSlug ?? null);

  useEffect(() => {
    setUserTheses(loadUserTheses());
  }, []);


  const sorted = useMemo(() => sortThesesForDashboard([...systemTheses, ...userTheses]), [systemTheses, userTheses]);
  const liveSorted = useMemo(() => live.sortPinnedFirst(sorted), [live, sorted]);
  const moveBySlug = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of liveSorted) {
      const b = getThesisDetail(t.slug);
      const ev = b?.evidence?.[0];
      if (!ev) {
        m.set(t.slug, 0);
        continue;
      }
      m.set(t.slug, Math.abs(ev.probabilityAfter - ev.probabilityBefore));
    }
    return m;
  }, [liveSorted]);

  const filtered = useMemo(() => {
    let list = liveSorted;
    if (show === "ready") list = list.filter((t) => t.status === "ready");
    if (assetClass !== "all") list = list.filter((t) => assetClassFor(t) === assetClass);

    const next = [...list];
    next.sort((a, b) => {
      if (sortKey === "probability") return b.probability - a.probability;
      if (sortKey === "biggest_move") return (moveBySlug.get(b.slug) ?? 0) - (moveBySlug.get(a.slug) ?? 0);
      return parseRelativeMinutes(a.lastUpdated) - parseRelativeMinutes(b.lastUpdated);
    });
    return next;
  }, [assetClass, moveBySlug, show, sortKey, liveSorted]);

  const focus = useMemo(() => filtered.filter((t) => t.status === "ready" || t.status === "active"), [filtered]);
  const focusTop = useMemo(() => focus.slice(0, 3), [focus]);
  const focusIds = useMemo(() => new Set(focusTop.map((t) => t.id)), [focusTop]);

  const monitoring = useMemo(
    () => filtered.filter((t) => !focusIds.has(t.id) && (t.status === "watching" || t.status === "forming")),
    [filtered, focusIds],
  );
  const archived = useMemo(
    () => filtered.filter((t) => !focusIds.has(t.id) && (t.status === "resolved" || t.status === "invalidated")),
    [filtered, focusIds],
  );

  return (
    <>
      <LiveSignalTicker items={live.tickerItems} intervalMs={12_000} />

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

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 bg-zinc-900/20 p-1">
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
              show === "ready" ? "bg-zinc-900/60 text-zinc-100" : "text-zinc-500 hover:text-zinc-300",
            ].join(" ")}
            onClick={() => setShow("ready")}
          >
            Ready only
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

      <section className="mt-7">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Focus</h2>
          <span className="text-[11px] text-zinc-600">Ready / Active</span>
        </div>

        {focusTop.length === 0 ? (
          <div className="mt-3 bg-zinc-900/20 px-4 py-3 text-[12px] text-zinc-500">
            No Ready or Active theses match the current filters.
          </div>
        ) : focusTop.length === 1 ? (
          <div className="mt-3">
            <ThesisCard
              thesis={focusTop[0]}
              variant="primary"
              selectedSlug={drawerSlug}
              pulseKey={live.pulseKey(focusTop[0].id)}
              onSelect={(s) => setDrawerSlug(s)}
            />
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-12">
            <div className="md:col-span-7">
              <ThesisCard
                thesis={focusTop[0]}
                variant="primary"
                selectedSlug={drawerSlug}
                pulseKey={live.pulseKey(focusTop[0].id)}
                onSelect={(s) => setDrawerSlug(s)}
              />
            </div>
            <div className="grid gap-3 md:col-span-5">
              {focusTop.slice(1).map((t) => (
                <ThesisCard
                  key={t.id}
                  thesis={t}
                  selectedSlug={drawerSlug}
                  pulseKey={live.pulseKey(t.id)}
                  onSelect={(s) => setDrawerSlug(s)}
                />
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="mt-10">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Monitor</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
              Watching and forming theses stay visible, but quieter and denser.
            </p>
          </div>
          <div className="hidden text-[11px] text-zinc-600 sm:block">Thesis · Probability · Status · Last update · Star</div>
        </div>

        <div className="mt-3 bg-zinc-900/20">
          <div className="hidden grid-cols-[1fr_76px_92px_96px_44px] gap-3 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600 sm:grid">
            <span>Thesis</span>
            <span className="text-right">Prob</span>
            <span className="text-right">Status</span>
            <span className="text-right">Update</span>
            <span className="text-right">Star</span>
          </div>
          <div className="mt-1 grid gap-0">
            {monitoring.length ? (
              monitoring.map((t) => (
                <ThesisTableRow
                  key={t.id}
                  thesis={t}
                  selected={drawerSlug === t.slug}
                  pulseKey={live.pulseKey(t.id)}
                  starred={live.isEffectivelyStarred(t.id)}
                  starDisabled={!!live.starDisabledReason(t.id)}
                  onToggleStar={() => live.toggleStar(t.id)}
                  onSelect={() => setDrawerSlug(t.slug)}
                />
              ))
            ) : (
              <div className="px-3 py-4 text-[12px] text-zinc-500">No watching or forming theses match the current filters.</div>
            )}
          </div>
        </div>
      </section>

      {archived.length ? (
        <section className="mt-9">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Archive</h2>
            <span className="text-[11px] text-zinc-600">Resolved / Invalidated</span>
          </div>
          <div className="mt-3 bg-zinc-900/15">
            <div className="mt-1 grid gap-0">
              {archived.map((t) => (
                <ThesisTableRow
                  key={t.id}
                  thesis={t}
                  selected={drawerSlug === t.slug}
                  pulseKey={live.pulseKey(t.id)}
                  starred={live.isEffectivelyStarred(t.id)}
                  starDisabled={!!live.starDisabledReason(t.id)}
                  onToggleStar={() => live.toggleStar(t.id)}
                  onSelect={() => setDrawerSlug(t.slug)}
                />
              ))}
            </div>
          </div>
        </section>
      ) : null}

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

      <ThesisDetailDrawer slug={drawerSlug} onClose={() => setDrawerSlug(null)} />
    </>
  );
}

