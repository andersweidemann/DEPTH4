"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ThesisTableRow } from "@/components/thesis-engine-v2/ThesisTableRow";
import { LiveSignalTicker } from "@/components/thesis-engine-v2/LiveSignalTicker";
import { CreateThesisModal } from "@/components/thesis-engine-v2/CreateThesisModal";
import { ThesisDetailDrawer } from "@/components/thesis-engine-v2/ThesisDetailDrawer";
import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { sortThesesForDashboard } from "@/lib/thesis-engine-v2/catalog-data";
import {
  focusInitialVisibleCount,
  orderFocusThesesCuratedThen,
} from "@/lib/thesis-engine-v2/curated-focus-theses";
import {
  computeMonitoringSection,
  monitoringInitialVisibleCount,
} from "@/lib/thesis-engine-v2/theses-monitoring-select";
import { loadUserTheses, upsertUserThesis } from "@/lib/thesis-engine-v2/user-theses";
import { putUserThesisToSupabase } from "@/lib/thesis-engine-v2/sync-user-thesis-client";
import { useThesisLive } from "@/lib/thesis-engine-v2/thesis-live-context";
import { useRequireFeature } from "@/lib/thesis-engine-v2/feature-gate";
import {
  defaultScenarioOverridesFromThesis,
  leadScenarioProbabilityFromDbTriple,
} from "@/lib/thesis-engine-v2/thesis-display-scenarios";

type AssetClass = "all" | "equity" | "rates" | "fx" | "commodities" | "crypto";
type SortKey = "recent" | "probability" | "biggest_move";

/** Headline % implied by shipped defaults only (ignores live overrides) — used when a log row has no `probability_before`. */
function impliedDefaultHeadlineLead(thesis: Thesis): number {
  const o = defaultScenarioOverridesFromThesis(thesis);
  return leadScenarioProbabilityFromDbTriple({
    base: o.base.probability,
    bull: o.bull.probability,
    bear: o.bear.probability,
  });
}

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
  const requireFeature = useRequireFeature();
  const [open, setOpen] = useState(false);
  const [userTheses, setUserTheses] = useState<Thesis[]>([]);
  const [show, setShow] = useState<"all" | "ready" | "starred">("all");
  const [assetClass, setAssetClass] = useState<AssetClass>("all");
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [drawerSlug, setDrawerSlug] = useState<string | null>(initialDrawerSlug ?? null);
  const [focusExpanded, setFocusExpanded] = useState(false);
  const [monitoringExpanded, setMonitoringExpanded] = useState(false);

  useEffect(() => {
    setUserTheses(loadUserTheses());
  }, []);

  useEffect(() => {
    setFocusExpanded(false);
    setMonitoringExpanded(false);
  }, [show, assetClass, sortKey, systemTheses, userTheses]);


  const sorted = useMemo(() => sortThesesForDashboard([...systemTheses, ...userTheses]), [systemTheses, userTheses]);
  const liveSorted = useMemo(() => live.sortPinnedFirst(sorted), [live, sorted]);
  /** Per-thesis evidence rows, newest first — correct “latest” for biggest-move even when the global batch is interleaved. */
  const evidenceRowsByThesisId = useMemo(() => {
    const map = new Map<string, (typeof live.evidenceLog)[number][]>();
    for (const r of live.evidenceLog) {
      const id = r.thesisId.trim();
      if (!id) continue;
      const arr = map.get(id);
      if (arr) arr.push(r);
      else map.set(id, [r]);
    }
    map.forEach((arr) => {
      arr.sort((a, b) => b.createdAt - a.createdAt);
    });
    return map;
    // Only evidence rows matter; full `live` identity changes every poll and would thrash this map.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- live.evidenceLog
  }, [live.evidenceLog]);

  const moveBySlug = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of liveSorted) {
      const rows = evidenceRowsByThesisId.get(t.id) ?? [];
      const latest = rows[0];
      if (!latest?.probabilityAfter) {
        m.set(t.slug, 0);
        continue;
      }
      const afterLead = leadScenarioProbabilityFromDbTriple(latest.probabilityAfter);
      let beforeLead: number;
      if (latest.probabilityBefore) {
        beforeLead = leadScenarioProbabilityFromDbTriple(latest.probabilityBefore);
      } else if (rows[1]?.probabilityAfter) {
        // Prior snapshot on the same thesis (common when `probability_before` was omitted).
        beforeLead = leadScenarioProbabilityFromDbTriple(rows[1].probabilityAfter);
      } else {
        beforeLead = impliedDefaultHeadlineLead(t);
      }
      m.set(t.slug, Math.abs(afterLead - beforeLead));
    }
    return m;
  }, [evidenceRowsByThesisId, liveSorted]);

  const filtered = useMemo(() => {
    let list = liveSorted;
    if (show === "ready") list = list.filter((t) => t.status === "ready");
    if (show === "starred") list = list.filter((t) => live.isEffectivelyStarred(t.id));
    if (assetClass !== "all") list = list.filter((t) => assetClassFor(t) === assetClass);

    const next = [...list];
    const tieSlug = (a: Thesis, b: Thesis) => a.slug.localeCompare(b.slug);
    next.sort((a, b) => {
      if (sortKey === "probability") {
        const d = b.probability - a.probability;
        return d !== 0 ? d : tieSlug(a, b);
      }
      if (sortKey === "biggest_move") {
        const d = (moveBySlug.get(b.slug) ?? 0) - (moveBySlug.get(a.slug) ?? 0);
        return d !== 0 ? d : tieSlug(a, b);
      }
      const d = parseRelativeMinutes(a.lastUpdated) - parseRelativeMinutes(b.lastUpdated);
      return d !== 0 ? d : tieSlug(a, b);
    });
    return next;
  }, [assetClass, live, moveBySlug, show, sortKey, liveSorted]);

  const starredCount = useMemo(() => liveSorted.filter((t) => live.isEffectivelyStarred(t.id)).length, [live, liveSorted]);

  const drawerCatalogTitle = useMemo(() => {
    if (!drawerSlug) return null;
    return liveSorted.find((t) => t.slug === drawerSlug)?.title ?? null;
  }, [drawerSlug, liveSorted]);

  const drawerCatalogMicroLabel = useMemo(() => {
    if (!drawerSlug) return null;
    return liveSorted.find((t) => t.slug === drawerSlug)?.microLabel ?? null;
  }, [drawerSlug, liveSorted]);

  const drawerCatalogBody = useMemo(() => {
    if (!drawerSlug) return null;
    const id = liveSorted.find((t) => t.slug === drawerSlug)?.id;
    if (!id) return null;
    return live.catalogDbThesisBodies.get(id) ?? null;
  }, [drawerSlug, liveSorted, live.catalogDbThesisBodies]);

  const focus = useMemo(() => filtered.filter((t) => t.status === "ready" || t.status === "active"), [filtered]);

  const focusTieBreak = useCallback(
    (a: Thesis, b: Thesis) => {
      const tieSlug = (x: Thesis, y: Thesis) => x.slug.localeCompare(y.slug);
      if (sortKey === "probability") {
        const d = b.probability - a.probability;
        return d !== 0 ? d : tieSlug(a, b);
      }
      if (sortKey === "biggest_move") {
        const d = (moveBySlug.get(b.slug) ?? 0) - (moveBySlug.get(a.slug) ?? 0);
        return d !== 0 ? d : tieSlug(a, b);
      }
      const d = parseRelativeMinutes(a.lastUpdated) - parseRelativeMinutes(b.lastUpdated);
      return d !== 0 ? d : tieSlug(a, b);
    },
    [moveBySlug, sortKey],
  );

  /**
   * Ready/Active ordering:
   * - **Most recent update:** curated macro map first (breadth), then user rows by recency.
   * - **Probability / biggest move:** same comparator as the main list so Sort applies to Focus catalog rows.
   */
  const focusOrdered = useMemo(() => {
    if (sortKey === "recent") return orderFocusThesesCuratedThen(focus, focusTieBreak);
    return [...focus].sort(focusTieBreak);
  }, [focus, focusTieBreak, sortKey]);

  /** First Focus window size on the full ready/active list (used with Monitoring overflow split). */
  const focusWindowRows = useMemo(() => focusInitialVisibleCount(focusOrdered.length), [focusOrdered.length]);

  const { monitoringRows, borrowedFromFocusIds } = useMemo(
    () =>
      computeMonitoringSection({
        filtered,
        focusOrdered,
        focusInitialRows: focusWindowRows,
      }),
    [filtered, focusOrdered, focusWindowRows],
  );

  const focusForDisplay = useMemo(
    () => focusOrdered.filter((t) => !borrowedFromFocusIds.has(t.id)),
    [borrowedFromFocusIds, focusOrdered],
  );

  const focusInitialRows = useMemo(() => focusInitialVisibleCount(focusForDisplay.length), [focusForDisplay.length]);
  const focusVisible = useMemo(
    () => (focusExpanded ? focusForDisplay : focusForDisplay.slice(0, focusInitialRows)),
    [focusExpanded, focusInitialRows, focusForDisplay],
  );
  const focusHasMore = focusForDisplay.length > focusInitialRows;

  /** All ready/active (pre-borrow) — archive section hides overlap with this bucket. */
  const focusIds = useMemo(() => new Set(focus.map((t) => t.id)), [focus]);

  const monitoringInitialRows = useMemo(
    () => monitoringInitialVisibleCount(monitoringRows.length),
    [monitoringRows.length],
  );
  const monitoringVisible = useMemo(
    () => (monitoringExpanded ? monitoringRows : monitoringRows.slice(0, monitoringInitialRows)),
    [monitoringExpanded, monitoringInitialRows, monitoringRows],
  );
  const monitoringHasMore = monitoringRows.length > monitoringInitialRows;
  const archived = useMemo(
    () => filtered.filter((t) => !focusIds.has(t.id) && (t.status === "resolved" || t.status === "invalidated")),
    [filtered, focusIds],
  );

  const showNewUserEmpty = filtered.length === 0 && userTheses.length === 0;

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
          <button
            type="button"
            className="rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold text-amber-200/90 hover:bg-amber-500/15"
            onClick={() => {
              requireFeature("createPrivateTheses", "new-thesis", () => setOpen(true));
            }}
          >
            + New thesis
          </button>
        </div>
      </div>

      {showNewUserEmpty ? (
        <section className="mt-8 bg-zinc-950/35 p-6 ring-1 ring-white/[0.08] sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-xl">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Welcome</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-zinc-50">Create your first thesis</h2>
              <p className="mt-2 text-[13px] leading-relaxed text-zinc-300">
                A thesis is a macro narrative with scenarios and confirmation signals. Star it to receive probability-change alerts.
              </p>
              <p className="mt-3 text-[12px] text-zinc-500">
                Example: <span className="text-zinc-300">US Defense Reset — RTX / LMT LONG</span>
              </p>
            </div>
            <button
              type="button"
              className="rounded-md border border-white/[0.10] bg-transparent px-4 py-2.5 text-[12px] font-semibold text-zinc-100 hover:bg-white/[0.05]"
              onClick={() => requireFeature("createPrivateTheses", "new-thesis", () => setOpen(true))}
            >
              + New thesis
            </button>
          </div>
        </section>
      ) : null}

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
              show === "starred" ? "bg-zinc-900/60 text-zinc-100" : "text-zinc-500 hover:text-zinc-300",
            ].join(" ")}
            onClick={() => setShow("starred")}
          >
            Starred ({starredCount})
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
          <span className="text-[11px] text-zinc-600">Ready / Active · curated macro map</span>
        </div>

        {focusForDisplay.length === 0 ? (
          <div className="mt-3 bg-zinc-900/20 px-4 py-3 text-[12px] text-zinc-500">
            No Ready or Active theses match the current filters.
          </div>
        ) : (
          <div className="mt-3 bg-zinc-900/20">
            <div className="hidden grid-cols-[1fr_76px_92px_96px_44px] gap-3 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600 sm:grid">
              <span>Thesis</span>
              <span className="text-right">Prob</span>
              <span className="text-right">Status</span>
              <span className="text-right">Update</span>
              <span className="text-right">Star</span>
            </div>
            <div className="mt-1 grid gap-0">
              {focusVisible.map((t) => (
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
            {focusHasMore ? (
              <div className="border-t border-white/[0.06] px-3 py-2">
                <button
                  type="button"
                  className="text-[11px] font-semibold text-amber-200/85 hover:text-amber-100"
                  onClick={() => setFocusExpanded((v) => !v)}
                >
                  {focusExpanded
                    ? "Show fewer"
                    : `See more · ${focusForDisplay.length - focusInitialRows} more ready/active`}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </section>

      <section className="mt-10">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Monitor</h2>
          <span className="text-[11px] text-zinc-600">Watching / forming · plus next ready/active on deck</span>
        </div>
        <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-zinc-600">
          Two to four high-signal rows: setup watches first, then the next ready/active names after the Focus window
          (active before ready). If only one strict watch exists, we borrow from the bottom of the Focus strip so the
          list still feels alive — those names show only here (not duplicated in Focus).
        </p>

        <div className="mt-3 bg-zinc-900/20">
          <div className="hidden grid-cols-[1fr_76px_92px_96px_44px] gap-3 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600 sm:grid">
            <span>Thesis</span>
            <span className="text-right">Prob</span>
            <span className="text-right">Status</span>
            <span className="text-right">Update</span>
            <span className="text-right">Star</span>
          </div>
          <div className="mt-1 grid gap-0">
            {monitoringRows.length ? (
              <>
                {monitoringVisible.map((t) => (
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
                {monitoringHasMore ? (
                  <div className="border-t border-white/[0.06] px-3 py-2">
                    <button
                      type="button"
                      className="text-[11px] font-semibold text-amber-200/85 hover:text-amber-100"
                      onClick={() => setMonitoringExpanded((v) => !v)}
                    >
                      {monitoringExpanded
                        ? "Show fewer"
                        : `See more · ${monitoringRows.length - monitoringInitialRows} more in Monitor`}
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="px-3 py-4 text-[12px] text-zinc-500">
                No monitor candidates match the current filters.
              </div>
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
          void putUserThesisToSupabase(t).then((r) => {
            if (!r.ok && r.error !== "sign_in_required") {
              console.warn("[theses] Could not sync thesis to server:", r.error);
            }
          });
        }}
      />

      <ThesisDetailDrawer
        slug={drawerSlug}
        catalogDisplayTitle={drawerCatalogTitle}
        catalogMicroLabel={drawerCatalogMicroLabel}
        catalogBody={drawerCatalogBody}
        onClose={() => setDrawerSlug(null)}
      />
    </>
  );
}

