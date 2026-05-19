import type { IncentiveAnalysis } from "@/types/incentive-analysis";
import type { CausalThesis, ThesisCluster } from "@/types/causal-graph";
import type { Thesis } from "@/lib/thesis-engine-v2/types";

export interface QualityCheck {
  name: string;
  required: boolean;
  weight: number;
}

export interface QualityCheckResult {
  name: string;
  passed: boolean;
  message: string;
  detail?: string;
}

export interface QualityReport {
  score: number;
  checks: QualityCheckResult[];
  canPromote: boolean;
  blockers: string[];
  promotionTarget: "watch" | "active" | "ready";
}

/** Input for quality gate — decoupled from storage shape. */
export interface QualityGateInput {
  slug: string;
  title: string;
  statement: string;
  targetAssetSymbol: string;
  direction: "up" | "down";
  conviction: number;
  timeHorizon: string;
  affects: Array<{ assetSymbol: string; direction: string }>;
  incentive_analysis?: IncentiveAnalysis | null;
  entryZone?: string | null;
  stop?: string | null;
  target1?: string | null;
}

const QUALITY_CHECKS: QualityCheck[] = [
  { name: "incentive_analysis", required: true, weight: 0.2 },
  { name: "causal_chain_depth", required: true, weight: 0.15 },
  { name: "conviction_calibrated", required: true, weight: 0.15 },
  { name: "no_contradiction", required: true, weight: 0.15 },
  { name: "time_horizon_specific", required: false, weight: 0.1 },
  { name: "trade_plan", required: false, weight: 0.1 },
  { name: "title_matches_direction", required: true, weight: 0.15 },
];

const UP_WORDS = ["rise", "climb", "surge", "rally", "recover", "lift", "ramp", "higher", "rebound", "moon", "bid"];
const DOWN_WORDS = [
  "fall",
  "drop",
  "crash",
  "fade",
  "sink",
  "tumble",
  "unwind",
  "lower",
  "decline",
  "short",
  "lag",
  "underperform",
];

export function runQualityGate(
  thesis: QualityGateInput,
  cluster: ThesisCluster | null,
  existingTheses: QualityGateInput[],
): QualityReport {
  const checks: QualityCheckResult[] = [];

  const incentive = thesis.incentive_analysis;
  const hasIncentive = !!incentive?.actor?.trim() && !!incentive?.goal?.trim();
  checks.push({
    name: "incentive_analysis",
    passed: hasIncentive,
    message: hasIncentive
      ? `Actor: ${incentive!.actor}, Goal: ${incentive!.goal}`
      : 'No incentive analysis — thesis lacks "who must do what and why" foundation',
    detail: hasIncentive ? JSON.stringify(incentive) : undefined,
  });

  const assetCount = thesis.affects?.length ?? 0;
  checks.push({
    name: "causal_chain_depth",
    passed: assetCount >= 3,
    message:
      assetCount >= 3
        ? `${assetCount} affected assets mapped`
        : `Only ${assetCount} assets — need at least 3 (primary + direct + indirect)`,
    detail: `assets: ${assetCount}`,
  });

  const isCalibrated = thesis.conviction !== 50 && thesis.conviction > 0 && thesis.conviction < 100;
  checks.push({
    name: "conviction_calibrated",
    passed: isCalibrated,
    message: isCalibrated
      ? `Conviction: ${thesis.conviction}% — calibrated`
      : `Conviction: ${thesis.conviction}% — appears to be default/placeholder score`,
    detail: `conviction: ${thesis.conviction}`,
  });

  const contradiction = findContradiction(thesis, existingTheses, cluster);
  checks.push({
    name: "no_contradiction",
    passed: !contradiction,
    message: contradiction ? `Contradiction: ${contradiction.message}` : "No contradictions with existing theses",
    detail: contradiction ? JSON.stringify(contradiction) : undefined,
  });

  const horizon = (thesis.timeHorizon ?? "").trim();
  const horizonLower = horizon.toLowerCase();
  const hasSpecificTime =
    horizon.length > 0 &&
    !horizon.includes("2-8") &&
    !horizon.includes("2–8") &&
    !horizonLower.includes("weeks to quarters") &&
    !(horizonLower === "weeks" || horizonLower === "2–8 weeks");
  checks.push({
    name: "time_horizon_specific",
    passed: hasSpecificTime,
    message: hasSpecificTime
      ? `Time horizon: ${horizon}`
      : `Time horizon too vague: "${horizon || "—"}" — needs specific window`,
    detail: `time_horizon: ${horizon}`,
  });

  const hasTradePlan =
    !!thesis.entryZone?.trim() && !!thesis.stop?.trim() && !!thesis.target1?.trim();
  checks.push({
    name: "trade_plan",
    passed: hasTradePlan,
    message: hasTradePlan
      ? "Trade plan with entry, stop, and targets"
      : "Missing trade plan — no actionable levels",
    detail: hasTradePlan ? "complete" : "missing",
  });

  const titleMatches = checkTitleMatchesDirection(thesis);
  checks.push({
    name: "title_matches_direction",
    passed: titleMatches.passed,
    message: titleMatches.message,
    detail: `direction: ${thesis.direction}, title: ${thesis.title}`,
  });

  let score = 0;
  const blockers: string[] = [];

  for (const check of checks) {
    const def = QUALITY_CHECKS.find((q) => q.name === check.name);
    if (check.passed) {
      score += (def?.weight ?? 0) * 100;
    } else if (def?.required) {
      blockers.push(check.name);
    }
  }

  score = Math.round(score);

  let promotionTarget: QualityReport["promotionTarget"] = "watch";
  if (score >= 70 && blockers.length === 0) promotionTarget = "ready";
  else if (score >= 50 && blockers.length === 0) promotionTarget = "active";

  return {
    score,
    checks,
    canPromote: blockers.length === 0 && score >= 40,
    blockers,
    promotionTarget,
  };
}

export function qualityGateInputFromEngineThesis(thesis: Thesis): QualityGateInput {
  const direction = thesis.direction === "short" ? "down" : thesis.direction === "long" ? "up" : "down";
  const asset = thesis.asset?.trim() || "—";
  const symbol = asset.length > 12 ? asset.split(/[\s/]/)[0]! : asset;

  return {
    slug: thesis.slug,
    title: thesis.title,
    statement: thesis.thesisStatement || thesis.title,
    targetAssetSymbol: symbol,
    direction,
    conviction: Math.round(thesis.probability ?? 50),
    timeHorizon: thesis.horizon?.trim() || "2–8 weeks",
    affects: [],
    incentive_analysis: thesis.incentiveAnalysis ?? null,
    entryZone: thesis.entryZone ?? null,
    stop: thesis.stop ?? null,
    target1: thesis.target1 ?? null,
  };
}

export function qualityGateInputFromCausalThesis(
  thesis: CausalThesis,
  extra?: Partial<QualityGateInput>,
): QualityGateInput {
  return {
    slug: thesis.slug,
    title: thesis.title,
    statement: thesis.statement,
    targetAssetSymbol: thesis.targetAssetSymbol,
    direction: thesis.direction,
    conviction: thesis.conviction,
    timeHorizon: thesis.timeHorizon,
    affects: thesis.affects.map((a) => ({ assetSymbol: a.assetSymbol, direction: a.direction })),
    incentive_analysis: thesis.incentive_analysis,
    ...extra,
  };
}

function findContradiction(
  thesis: QualityGateInput,
  existingTheses: QualityGateInput[],
  cluster: ThesisCluster | null,
): { message: string } | null {
  if (!cluster) return null;

  const clusterSlugs = new Set(cluster.theses.map((t) => t.slug));
  const sameAsset = existingTheses.find(
    (t) =>
      t.slug !== thesis.slug &&
      t.targetAssetSymbol.toUpperCase() === thesis.targetAssetSymbol.toUpperCase() &&
      t.direction !== thesis.direction &&
      clusterSlugs.has(t.slug),
  );

  if (sameAsset) {
    return {
      message: `${thesis.title} (${thesis.direction}) vs ${sameAsset.title} (${sameAsset.direction}) on ${thesis.targetAssetSymbol}`,
    };
  }

  return null;
}

function checkTitleMatchesDirection(thesis: QualityGateInput): { passed: boolean; message: string } {
  const titleLower = thesis.title.toLowerCase();
  const direction = thesis.direction;

  const hasUpWord = UP_WORDS.some((w) => titleLower.includes(w));
  const hasDownWord = DOWN_WORDS.some((w) => titleLower.includes(w));

  if (direction === "up" && hasDownWord && !hasUpWord) {
    return {
      passed: false,
      message: `Title says DOWN ("${thesis.title}") but thesis is LONG — fix title or direction`,
    };
  }
  if (direction === "down" && hasUpWord && !hasDownWord) {
    return {
      passed: false,
      message: `Title says UP ("${thesis.title}") but thesis is SHORT — fix title or direction`,
    };
  }

  return { passed: true, message: "Title matches thesis direction" };
}

export const THESIS_STATUS_RANK: Record<string, number> = {
  forming: 0,
  watching: 1,
  active: 2,
  ready: 3,
  resolved: 4,
  invalidated: 4,
  archived: 4,
};

export function isThesisStatusPromotion(oldStatus: string, newStatus: string): boolean {
  const oldRank = THESIS_STATUS_RANK[oldStatus] ?? -1;
  const newRank = THESIS_STATUS_RANK[newStatus] ?? -1;
  return newRank > oldRank && newRank <= 3;
}

export function getMinQualityScoreForStatus(status: string): number {
  switch (status) {
    case "ready":
      return 65;
    case "active":
      return 45;
    case "watching":
      return 25;
    default:
      return 0;
  }
}

export function getDowngradeStatusForScore(score: number): string {
  if (score >= 65) return "ready";
  if (score >= 45) return "active";
  if (score >= 25) return "watching";
  return "forming";
}

/** Initial DB status after AI generation from quality report. */
export function initialStatusFromQualityReport(report: QualityReport): "forming" | "watching" {
  if (report.score < 25) return "forming";
  if (report.score < 45) return "watching";
  return "watching";
}

/** Hide from /theses list when scored as junk. */
export function isQualityHiddenFromList(qualityScore: number | null | undefined, status: string): boolean {
  if (qualityScore == null || qualityScore === 0) return false;
  return status === "forming" && qualityScore < 25;
}

export function qualityChecksToJson(checks: QualityCheckResult[]): unknown {
  return checks;
}
