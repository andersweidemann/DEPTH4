/**
 * Homepage / thesis-map buckets: **rank-first**, soft lane labels. Uses existing engine fields only
 * (`getThesisDisplayModel`, `getThesisMispricing`, `scores`, status, recency) — no DB writes here.
 */
import type { Thesis as EngineThesis, ThesisStatus as EngineStatus } from "@/lib/thesis-engine-v2/types";
import { getThesisDisplayModel } from "@/lib/thesis-engine-v2/thesis-display-selectors";
import { getThesisMispricing } from "@/lib/thesis-engine-v2/mispricing";
import type { ThesisLifecycleState, ThesisSurfacedBucket } from "@/types/thesis";

/** Max ready/active rows in the Tradable lane (overflow → Monitoring, still ranked). */
export const HOME_TRADABLE_BUCKET_MAX = 15;
/** @deprecated Prefer {@link HOME_TRADABLE_BUCKET_MAX}; kept for import stability in tests. */
export const HOME_TRADABLE_CAP = HOME_TRADABLE_BUCKET_MAX;

/** Safety ceiling on Emerging (watching/forming); partition rarely hits this. */
export const HOME_EMERGING_CAP = 500;

/** Reserved for optional UI truncation — partition does not slice monitoring. */
export const HOME_MONITORING_SOFT_CAP = 15;
export const HOME_ARCHIVE_PREVIEW_CAP = 5;

function parseUpdatedMs(v: string): number {
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) return d.getTime();
  return 0;
}

/** Phase 1: single axis — `forming` is registry/discovery; in-play rows are `live`; terminal states explicit. */
export function deriveLifecycleState(st: EngineStatus): ThesisLifecycleState {
  if (st === "resolved") return "resolved";
  if (st === "invalidated") return "invalidated";
  if (st === "forming") return "discovered";
  return "live";
}

/**
 * Legacy v0 surface score (still used for `thesis_score` when DB has no cached value, and cron backfill).
 */
export function thesisScoreV0(t: EngineThesis): number {
  const conv = getThesisDisplayModel(t).convictionPct;
  const mp = getThesisMispricing(t, {}).score;
  const recencyNorm = Math.min(1, parseUpdatedMs(t.lastUpdated) / (Date.now() + 1));
  return conv * 2 + mp * 1.5 + recencyNorm * 8;
}

/**
 * Blended **home-map rank**: conviction + mispricing + recency + status lane + light book-strength hint.
 * Used only for bucket assignment and ordering — not a hard cliff on any single axis.
 */
export function thesisMapHomeRankScore(t: EngineThesis): number {
  const conv = getThesisDisplayModel(t).convictionPct;
  const mp = getThesisMispricing(t, {}).score;
  const recencyNorm = Math.min(1, parseUpdatedMs(t.lastUpdated) / (Date.now() + 1));
  const statusLane =
    t.status === "ready" ? 14 : t.status === "active" ? 10 : t.status === "watching" ? 5 : t.status === "forming" ? 1 : 0;
  const book = Math.min(12, (t.scores?.total ?? 0) / 8);
  return conv * 1.65 + mp * 1.25 + recencyNorm * 14 + statusLane + book;
}

function mispricingScore(t: EngineThesis): number {
  return getThesisMispricing(t, {}).score;
}

function compareHomeRank(a: EngineThesis, b: EngineThesis): number {
  const d = thesisMapHomeRankScore(b) - thesisMapHomeRankScore(a);
  if (d !== 0) return d;
  const mp = mispricingScore(b) - mispricingScore(a);
  if (mp !== 0) return mp;
  return parseUpdatedMs(b.lastUpdated) - parseUpdatedMs(a.lastUpdated);
}

export type HomeBucketPartition = {
  tradable: EngineThesis[];
  emerging: EngineThesis[];
  monitoring: EngineThesis[];
  archivePreview: EngineThesis[];
};

export type PartitionHomeBucketsOptions = {
  /**
   * When set, rows that return false are excluded from tradable / emerging / monitoring
   * (they keep `surfaced_bucket` null). Archive preview still uses all terminal rows from `combined`.
   */
  homeBucketEligible?: (t: EngineThesis) => boolean;
};

/**
 * Soft buckets on top of one rank axis:
 * - **Tradable**: top {@link HOME_TRADABLE_BUCKET_MAX} **ready/active** rows by {@link thesisMapHomeRankScore}.
 * - **Emerging**: all **watching/forming** in the live pool (rank-ordered), up to {@link HOME_EMERGING_CAP}.
 * - **Monitoring**: remaining live rows (overflow ready/active + anything else), rank-ordered — uncapped.
 */
export function partitionHomeBuckets(combined: EngineThesis[], options?: PartitionHomeBucketsOptions): HomeBucketPartition {
  const eligible = options?.homeBucketEligible;
  const inHomeBuckets = (t: EngineThesis) => (eligible ? eligible(t) : true);

  const terminal = combined.filter((t) => t.status === "resolved" || t.status === "invalidated");
  const archivePreview = [...terminal]
    .sort((a, b) => parseUpdatedMs(b.lastUpdated) - parseUpdatedMs(a.lastUpdated))
    .slice(0, HOME_ARCHIVE_PREVIEW_CAP);

  const livePool = combined.filter(
    (t) => t.status !== "resolved" && t.status !== "invalidated" && inHomeBuckets(t),
  );

  const readyActive = livePool.filter((t) => t.status === "ready" || t.status === "active");
  const watchingForming = livePool.filter((t) => t.status === "watching" || t.status === "forming");

  const tradable = [...readyActive].sort(compareHomeRank).slice(0, HOME_TRADABLE_BUCKET_MAX);

  const emerging = [...watchingForming].sort(compareHomeRank).slice(0, HOME_EMERGING_CAP);

  const placed = new Set<string>([...tradable, ...emerging].map((t) => t.id));
  const rest = livePool.filter((t) => !placed.has(t.id));
  const monitoring = [...rest].sort(compareHomeRank);

  return { tradable, emerging, monitoring, archivePreview };
}

export function surfacedBucketForEngineThesis(
  t: EngineThesis,
  partition: HomeBucketPartition,
): ThesisSurfacedBucket | null {
  if (t.status === "resolved" || t.status === "invalidated") return null;
  const id = t.id;
  if (partition.tradable.some((x) => x.id === id)) return "tradable";
  if (partition.emerging.some((x) => x.id === id)) return "emerging";
  if (partition.monitoring.some((x) => x.id === id)) return "monitoring";
  return null;
}
