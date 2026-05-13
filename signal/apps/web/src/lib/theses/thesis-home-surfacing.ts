/**
 * Phase 1 homepage surfacing: derives `lifecycle_state` and `surfaced_bucket` from existing
 * `ThesisStatus` / engine fields only. Does **not** read or write `scenario_probabilities` or conviction math —
 * callers pass already-built `EngineThesis` rows; scoring uses `getThesisDisplayModel` / `getThesisMispricing` as read-only inputs.
 */
import type { Thesis as EngineThesis, ThesisStatus as EngineStatus } from "@/lib/thesis-engine-v2/types";
import { getThesisDisplayModel } from "@/lib/thesis-engine-v2/thesis-display-selectors";
import { getThesisMispricing } from "@/lib/thesis-engine-v2/mispricing";
import type { ThesisLifecycleState, ThesisSurfacedBucket } from "@/types/thesis";

/**
 * Tradable lane: highest-priority ready/active rows (tight slot + score floors). Overflow ready/active lands in
 * `monitoring` so the bucket is never structurally empty when those statuses exist.
 */
export const HOME_TRADABLE_BUCKET_MAX = 7;
/** @deprecated Prefer {@link HOME_TRADABLE_BUCKET_MAX}; kept for import stability in older tests. */
export const HOME_TRADABLE_CAP = HOME_TRADABLE_BUCKET_MAX;
export const TRADABLE_MIN_MISPRICING_SCORE = 60;
export const TRADABLE_MIN_CONVICTION_PCT = 75;

/** Emerging: mid mispricing band on watching/forming narratives. */
export const EMERGING_MIN_CONVICTION_PCT = 70;
export const EMERGING_MISPRICING_MIN = 45;
export const EMERGING_MISPRICING_MAX = 60;
/** Safety ceiling only — emerging is naturally narrow. */
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

/** v0 score: higher = more surface-worthy (weights are provisional). */
export function thesisScoreV0(t: EngineThesis): number {
  const conv = getThesisDisplayModel(t).convictionPct;
  const mp = getThesisMispricing(t, {}).score;
  const recencyNorm = Math.min(1, parseUpdatedMs(t.lastUpdated) / (Date.now() + 1));
  return conv * 2 + mp * 1.5 + recencyNorm * 8;
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

function convictionPct(t: EngineThesis): number {
  return getThesisDisplayModel(t).convictionPct;
}

function mispricingScore(t: EngineThesis): number {
  return getThesisMispricing(t, {}).score;
}

function compareTradableSlot(a: EngineThesis, b: EngineThesis): number {
  const mp = mispricingScore(b) - mispricingScore(a);
  if (mp !== 0) return mp;
  const c = convictionPct(b) - convictionPct(a);
  if (c !== 0) return c;
  return thesisScoreV0(b) - thesisScoreV0(a);
}

/**
 * Ranked buckets:
 * - **Tradable**: ready/active that meet conviction + mispricing floors, top {@link HOME_TRADABLE_BUCKET_MAX} by mispricing.
 * - **Emerging**: watching/forming in the mid mispricing band with sufficient conviction (forming narratives).
 * - **Monitoring**: every other non-archived in-play row (overflow ready/active, low-score ready/active, watching outside emerging band, etc.) — **not** hard-capped.
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

  const tradableCandidates = readyActive.filter(
    (t) =>
      convictionPct(t) >= TRADABLE_MIN_CONVICTION_PCT && mispricingScore(t) >= TRADABLE_MIN_MISPRICING_SCORE,
  );
  const tradable = [...tradableCandidates].sort(compareTradableSlot).slice(0, HOME_TRADABLE_BUCKET_MAX);

  const emergingCandidates = watchingForming.filter(
    (t) =>
      convictionPct(t) >= EMERGING_MIN_CONVICTION_PCT &&
      mispricingScore(t) >= EMERGING_MISPRICING_MIN &&
      mispricingScore(t) <= EMERGING_MISPRICING_MAX,
  );
  const emerging = [...emergingCandidates]
    .sort((a, b) => thesisScoreV0(b) - thesisScoreV0(a))
    .slice(0, HOME_EMERGING_CAP);

  const placed = new Set<string>([...tradable, ...emerging].map((t) => t.id));
  const rest = livePool.filter((t) => !placed.has(t.id));
  const monitoring = [...rest].sort((a, b) => thesisScoreV0(b) - thesisScoreV0(a));

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
