/**
 * Thesis-level **scenario evidence score** model (DEPTH4).
 *
 * This module defines how we *intend* to turn macro / news / flow evidence
 * into **path scores**, then into **displayed resolution-path weights**.
 *
 * **Important distinctions**
 * - **Template triples** — shipped defaults ([40,35,25], etc.). Not evidence-backed;
 *   Scenario View hides `%` until we have something better.
 * - **Provisional live probabilities** — output of this placeholder pipeline
 *   (scores → softmax). Still **uncalibrated**; useful for product iteration
 *   and logging, not for claiming statistical calibration.
 * - **Future calibrated probabilities** — after we log predictions + realized
 *   outcomes and fit a calibration layer (Brier / reliability → Platt / isotonic
 *   or similar). See `scenario-probability-log.ts`.
 *
 * TODO: Replace placeholder heuristics with a trained model; add calibration
 * layer on top of raw scores once we have logged predictions + outcomes.
 *
 * **Relation to `thesisDepthBook`:** resolution paths describe *how the hero thesis resolves*; depth nodes describe
 * *causal time chain + per-depth market gap*. Scenario weights should eventually condition on depth mispricing signals.
 */

import { isUncalibratedScenarioTripleCleanMessyBroken } from "@/lib/thesis-engine-v2/thesis-display-scenarios";

// ---------------------------------------------------------------------------
// Inputs: structured evidence snapshot
// ---------------------------------------------------------------------------

export type MacroSignal = {
  id: string;
  label: string;
  /** Normalized strength in [-1, 1] for thesis direction; placeholder. */
  stance: number;
  asOf: string;
};

export type NewsSignal = {
  id: string;
  headline: string;
  sentiment: "supportive" | "breaking" | "mixed" | "neutral";
  /** Coarse tags derived from `eventType` / copy until NLP ships. */
  directionTags: string[];
};

export type FlowSignal = {
  id: string;
  label: string;
  /** +1 supportive of thesis, -1 against, 0 unknown — placeholder. */
  skew: number;
};

export type ThesisScenarioEvidenceSnapshot = {
  thesisId: string;
  slug?: string;
  timeWindow: { days: number };
  macro_signals: MacroSignal[];
  news_signals: NewsSignal[];
  flow_signals: FlowSignal[];
};

/** Minimal row shape from `ThesisEvidenceLogRow` without importing live context. */
export type ScenarioEvidenceRowInput = {
  id: string;
  createdAt: number;
  thesisId: string;
  eventType: string;
  description: string;
  probabilityBefore: { base: number; bull: number; bear: number } | null;
  probabilityAfter: { base: number; bull: number; bear: number } | null;
  metadata?: Record<string, unknown>;
};

export type BuildThesisScenarioEvidenceSnapshotParams = {
  thesisId: string;
  slug?: string;
  evidenceRows: ScenarioEvidenceRowInput[];
  /** Lookback window label for the snapshot (filtering by `createdAt` is TODO). */
  timeWindowDays: number;
};

// ---------------------------------------------------------------------------
// Score model output (not probabilities)
// ---------------------------------------------------------------------------

export type ScenarioPathRawScores = {
  cleanWinScore: number;
  messyWinScore: number;
  brokenThesisScore: number;
};

export type ScenarioEvidenceScoreMetadata = {
  supportiveCount: number;
  breakingCount: number;
  mixedCount: number;
  neutralCount: number;
  evidenceRowCount: number;
};

export type ScenarioEvidenceScoreResult = {
  rawScores: ScenarioPathRawScores;
  metadata: ScenarioEvidenceScoreMetadata & {
    evidenceSummary: string;
    lastUpdatedAt: string;
  };
};

// ---------------------------------------------------------------------------
// Provisional probability mapping (uncalibrated)
// ---------------------------------------------------------------------------

export type ProvisionalScenarioTriple = {
  /** Display order: clean %, messy %, broken % — integers, sum ≈ 100. */
  cleanPct: number;
  messyPct: number;
  brokenPct: number;
};

const NEUTRAL_FALLBACK_TRIPLE: ProvisionalScenarioTriple = { cleanPct: 33, messyPct: 34, brokenPct: 33 };

/** Softmax sharpness on shifted scores; lower = flatter distribution. */
const DEFAULT_SOFTMAX_K = 0.12;

// ---------------------------------------------------------------------------
// Snapshot builder (placeholder enrichment)
// ---------------------------------------------------------------------------

function sentimentFromDeltas(before: { base: number; bull: number; bear: number }, after: { base: number; bull: number; bear: number }): NewsSignal["sentiment"] {
  const dClean = after.bull - before.bull;
  const dBroken = after.bear - before.bear;
  const dMessy = after.base - before.base;
  const strong = 3;
  const supportive = dClean >= strong && dBroken <= 1;
  const breaking = dBroken >= strong && dClean <= 1;
  const messy = Math.abs(dClean) < strong && Math.abs(dBroken) < strong && (Math.abs(dMessy) >= 2 || (dClean > 0 && dBroken > 0));
  if (supportive && !breaking) return "supportive";
  if (breaking && !supportive) return "breaking";
  if (messy) return "mixed";
  if (Math.abs(dClean) >= 2 || Math.abs(dBroken) >= 2) return "mixed";
  return "neutral";
}

/** When cron rows omit `probability_after` (legacy) or deltas are flat, use `thesis-news` metadata reasons. */
function sentimentFromEvidenceMetadata(meta: Record<string, unknown> | undefined): NewsSignal["sentiment"] | null {
  if (!meta || typeof meta !== "object") return null;
  const reasons = meta.reasons;
  if (!Array.isArray(reasons)) return null;
  const tags = reasons.map((x) => String(x).toLowerCase());
  if (tags.includes("confirm_tag")) return "supportive";
  if (tags.includes("contradict_tag")) return "breaking";
  if (tags.includes("ticker_hit")) return "mixed";
  return null;
}

/**
 * Build a structured evidence snapshot for scoring.
 *
 * TODO: Pull real macro panel + options flow; filter rows by `timeWindowDays`
 * using `createdAt`; enrich `directionTags` via NLP / entity linking.
 */
export function buildThesisScenarioEvidenceSnapshot(params: BuildThesisScenarioEvidenceSnapshotParams): ThesisScenarioEvidenceSnapshot {
  const { thesisId, slug, evidenceRows, timeWindowDays } = params;
  const news_signals: NewsSignal[] = evidenceRows.map((r) => {
    let sentiment: NewsSignal["sentiment"] = "neutral";
    if (r.probabilityBefore && r.probabilityAfter) {
      sentiment = sentimentFromDeltas(r.probabilityBefore, r.probabilityAfter);
    } else {
      const fromMeta = sentimentFromEvidenceMetadata(r.metadata);
      if (fromMeta) sentiment = fromMeta;
    }
    return {
      id: r.id,
      headline: (r.description || r.eventType || "Evidence").slice(0, 220),
      sentiment,
      directionTags: [r.eventType].filter(Boolean),
    };
  });

  /** Single aggregate macro placeholder until real macro panels wire in. */
  const macro_signals: MacroSignal[] =
    evidenceRows.length > 0
      ? [
          {
            id: `macro-${thesisId}-aggregate`,
            label: "Evidence density (log-derived aggregate)",
            stance: Math.min(1, Math.max(-1, evidenceRows.length / 8 - 0.35)),
            asOf: new Date(evidenceRows[evidenceRows.length - 1]!.createdAt).toISOString(),
          },
        ]
      : [];

  return {
    thesisId,
    slug,
    timeWindow: { days: timeWindowDays },
    macro_signals,
    news_signals,
    flow_signals: [],
  };
}

/** Minimum structured signals before we attempt a provisional triple. */
export const MIN_SIGNALS_FOR_SCENARIO_EVIDENCE_MODEL = 2;

export function evidenceSnapshotHasMinimumSignals(snapshot: ThesisScenarioEvidenceSnapshot): boolean {
  const n = snapshot.news_signals.length + snapshot.macro_signals.length + snapshot.flow_signals.length;
  return n >= MIN_SIGNALS_FOR_SCENARIO_EVIDENCE_MODEL;
}

/**
 * Placeholder **score model** — counts supportive / breaking / mixed items.
 *
 * - cleanWinScore ≈ (# strong supportive) − (# strong breaking)
 * - messyWinScore ≈ (# mixed / conflicting)
 * - brokenThesisScore ≈ (# strong breaking) − (# strong supportive)
 *
 * This is intentionally simple and **deterministic** for tests — not final economics.
 */
export function scoreScenarioPathsFromSnapshot(snapshot: ThesisScenarioEvidenceSnapshot): ScenarioEvidenceScoreResult {
  let supportiveCount = 0;
  let breakingCount = 0;
  let mixedCount = 0;
  let neutralCount = 0;

  for (const n of snapshot.news_signals) {
    if (n.sentiment === "supportive") supportiveCount += 1;
    else if (n.sentiment === "breaking") breakingCount += 1;
    else if (n.sentiment === "mixed") mixedCount += 1;
    else neutralCount += 1;
  }

  for (const m of snapshot.macro_signals) {
    if (m.stance > 0.25) supportiveCount += 1;
    else if (m.stance < -0.25) breakingCount += 1;
    else mixedCount += 1;
  }

  for (const f of snapshot.flow_signals) {
    if (f.skew > 0.2) supportiveCount += 1;
    else if (f.skew < -0.2) breakingCount += 1;
    else mixedCount += 1;
  }

  const rawScores: ScenarioPathRawScores = {
    cleanWinScore: supportiveCount - breakingCount,
    messyWinScore: mixedCount,
    brokenThesisScore: breakingCount - supportiveCount,
  };

  const evidenceSummary = `supportive=${supportiveCount}, breaking=${breakingCount}, mixed=${mixedCount}, neutral=${neutralCount}, rows=${snapshot.news_signals.length}`;

  return {
    rawScores,
    metadata: {
      supportiveCount,
      breakingCount,
      mixedCount,
      neutralCount,
      evidenceRowCount: snapshot.news_signals.length,
      evidenceSummary,
      lastUpdatedAt: new Date().toISOString(),
    },
  };
}

/**
 * Map raw path scores to a **provisional** integer percentage triple (sum 100).
 *
 * **Uncalibrated** — softmax on shifted scores. Later: log outputs + outcomes,
 * compute Brier / reliability, fit calibration (Platt / isotonic / etc.).
 */
export function provisionalPercentTripleFromRawScores(
  raw: ScenarioPathRawScores,
  k: number = DEFAULT_SOFTMAX_K,
): ProvisionalScenarioTriple {
  const { cleanWinScore, messyWinScore, brokenThesisScore } = raw;
  if (cleanWinScore <= 0 && messyWinScore <= 0 && brokenThesisScore <= 0) {
    return { ...NEUTRAL_FALLBACK_TRIPLE };
  }

  const shift = 5;
  const a = Math.exp(k * (cleanWinScore + shift));
  const b = Math.exp(k * (messyWinScore + shift));
  const c = Math.exp(k * (brokenThesisScore + shift));
  const s = a + b + c;
  let cleanPct = Math.round((100 * a) / s);
  let messyPct = Math.round((100 * b) / s);
  let brokenPct = Math.round((100 * c) / s);
  const sum = cleanPct + messyPct + brokenPct;
  const drift = 100 - sum;
  if (drift !== 0) {
    const maxIdx = cleanPct >= messyPct && cleanPct >= brokenPct ? 0 : messyPct >= brokenPct ? 1 : 2;
    if (maxIdx === 0) cleanPct += drift;
    else if (maxIdx === 1) messyPct += drift;
    else brokenPct += drift;
  }
  return { cleanPct, messyPct, brokenPct };
}

/** True when the provisional triple is not one of the shipped UI templates. */
export function provisionalTripleIsNotTemplateTriple(t: ProvisionalScenarioTriple): boolean {
  return !isUncalibratedScenarioTripleCleanMessyBroken(t.cleanPct, t.messyPct, t.brokenPct);
}

/** Attach provisional clean/messy/broken percentages to scenario rows (display order handled by pathKey). */
export function applyProvisionalTripleToScenarios<T extends { pathKey: string; probability: number }>(
  rows: T[],
  triple: ProvisionalScenarioTriple,
): T[] {
  return rows.map((row) => {
    if (row.pathKey === "clean_win") return { ...row, probability: triple.cleanPct };
    if (row.pathKey === "messy_win") return { ...row, probability: triple.messyPct };
    if (row.pathKey === "thesis_broken") return { ...row, probability: triple.brokenPct };
    return row;
  });
}

export type ScenarioEvidenceModelPipelineResult = {
  snapshot: ThesisScenarioEvidenceSnapshot;
  scoreResult: ScenarioEvidenceScoreResult;
  provisional: ProvisionalScenarioTriple;
  /** True when we should prefer `provisional` over template display triples. */
  useProvisional: boolean;
};

/**
 * End-to-end placeholder: snapshot → scores → provisional %.
 * `useProvisional` is true iff minimum signals exist **and** provisional triple is not a template.
 */
export function runScenarioEvidenceModelPipeline(params: BuildThesisScenarioEvidenceSnapshotParams): ScenarioEvidenceModelPipelineResult {
  const snapshot = buildThesisScenarioEvidenceSnapshot(params);
  const scoreResult = scoreScenarioPathsFromSnapshot(snapshot);
  const provisional = provisionalPercentTripleFromRawScores(scoreResult.rawScores);
  const useProvisional = evidenceSnapshotHasMinimumSignals(snapshot) && provisionalTripleIsNotTemplateTriple(provisional);
  return { snapshot, scoreResult, provisional, useProvisional };
}
