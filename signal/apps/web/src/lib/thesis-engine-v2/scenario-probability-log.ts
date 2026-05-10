/**
 * Calibration & logging hooks — **stubs for now**.
 *
 * Future work (once we log predictions + realized outcomes):
 * - **Brier score** and **reliability diagrams** to judge probability quality.
 * - **Platt scaling**, **isotonic regression**, or similar on top of raw scores
 *   or logits before mapping to displayed percentages.
 *
 * Call `logScenarioProbabilitySnapshot` whenever the Scenario View commits to
 * a displayed triple (template calibrating state, evidence-model provisional,
 * insider override, or post-calibration production). Ship payloads to a
 * warehouse / analytics pipeline — this module only defines the contract.
 */

/** Which pipeline produced the triple shown (or withheld) in Scenario View. */
export type ScenarioProbabilityLogMarker = "template" | "evidence_model" | "insider_override" | "merged_live";

export type ScenarioProbabilityLogPayload = {
  thesisId: string;
  slug?: string;
  /** UTC calendar day for daily aggregation, e.g. `2026-05-09`. */
  dayKey: string;
  pClean: number;
  pMessy: number;
  pBroken: number;
  supportiveSignalCount?: number;
  breakingSignalCount?: number;
  mixedSignalCount?: number;
  marker: ScenarioProbabilityLogMarker;
  /** True when numbers are from the placeholder score → softmax path (uncalibrated mapping). */
  provisional?: boolean;
};

/**
 * Record one scenario probability snapshot for later calibration.
 *
 * TODO: forward to analytics / warehouse. No-op in production until wired.
 */
export function logScenarioProbabilitySnapshot(_payload: ScenarioProbabilityLogPayload): void {
  void _payload;
}

/**
 * Placeholder for **realized path** over a horizon (PnL, analyst marking, etc.).
 * Not wired yet — keeps types ready for outcome-linked calibration.
 */
export type ScenarioRealizedOutcomePlaceholder = {
  thesisId: string;
  horizonEndedAt: string;
  realizedPath: "clean_win" | "messy_win" | "thesis_broken" | "unknown";
};
