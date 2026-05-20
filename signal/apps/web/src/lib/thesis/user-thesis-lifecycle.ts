import type { Thesis } from "@/lib/thesis-engine-v2/types";
import {
  isUncalibratedDisplayScenarioTriple,
  narrativeFallbackScenariosForThesis,
  buildDisplayScenariosFromThesis,
} from "@/lib/thesis-engine-v2/thesis-display-scenarios";

/** Persisted on `public.theses.body.user_calibration`. */
export type UserThesisCalibrationPhase = "assessing" | "tradeable" | "watching_no_edge";

export type UserThesisCalibration = {
  phase: UserThesisCalibrationPhase;
  summary?: string;
  assessed_at?: string;
  quality_score?: number;
  mispricing_pct?: number;
};

export const UNCALIBRATED_SCENARIO_DB = { base: 0, bull: 0, bear: 0 } as const;

export const USER_THESIS_PROMOTION = {
  minQualityScore: 60,
  minMispricingPct: 20,
} as const;

export function readUserCalibrationFromBody(body: unknown): UserThesisCalibration | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const raw = (body as Record<string, unknown>).user_calibration;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const phase = o.phase;
  if (phase !== "assessing" && phase !== "tradeable" && phase !== "watching_no_edge") return null;
  return {
    phase,
    summary: typeof o.summary === "string" ? o.summary.trim() : undefined,
    assessed_at: typeof o.assessed_at === "string" ? o.assessed_at : undefined,
    quality_score: typeof o.quality_score === "number" ? o.quality_score : undefined,
    mispricing_pct: typeof o.mispricing_pct === "number" ? o.mispricing_pct : undefined,
  };
}

export function userCalibrationToBodyPatch(cal: UserThesisCalibration): Record<string, unknown> {
  return { user_calibration: cal };
}

export function isUserOwnedThesis(thesis: Pick<Thesis, "origin" | "thesisOrigin">): boolean {
  return thesis.origin === "user" || thesis.thesisOrigin === "user";
}

export function isUserThesisAssessing(thesis: Thesis, body?: unknown): boolean {
  if (!isUserOwnedThesis(thesis)) return false;
  const cal = readUserCalibrationFromBody(body) ?? thesis.userCalibration;
  if (cal?.phase === "assessing") return true;
  if (thesis.status === "forming" || thesis.status === "watching") {
    if (!cal) return true;
    return cal.phase !== "tradeable" && cal.phase !== "watching_no_edge";
  }
  return false;
}

export function isUserThesisTradeable(thesis: Thesis, body?: unknown): boolean {
  if (!isUserOwnedThesis(thesis)) return false;
  const cal = readUserCalibrationFromBody(body) ?? thesis.userCalibration;
  if (cal?.phase === "tradeable") return true;
  return thesis.status === "ready" || thesis.status === "active";
}

export function isUserThesisWatchingNoEdge(thesis: Thesis, body?: unknown): boolean {
  if (!isUserOwnedThesis(thesis)) return false;
  const cal = readUserCalibrationFromBody(body) ?? thesis.userCalibration;
  return cal?.phase === "watching_no_edge" || (thesis.status === "watching" && cal?.phase !== "tradeable");
}

/** Hide conviction / scenario % until calibrated. */
export function shouldHideCalibratedEconomics(thesis: Thesis, body?: unknown): boolean {
  if (!isUserOwnedThesis(thesis)) return false;
  if (isUserThesisTradeable(thesis, body)) return false;
  if (isUserThesisAssessing(thesis, body)) return true;
  if (isUserThesisWatchingNoEdge(thesis, body)) return true;
  const scenarios = buildDisplayScenariosFromThesis(thesis, narrativeFallbackScenariosForThesis(thesis));
  return isUncalibratedDisplayScenarioTriple(scenarios);
}

export function mispricingPctFromThesis(thesis: Thesis): number {
  const fromCal = thesis.userCalibration?.mispricing_pct;
  if (typeof fromCal === "number" && Number.isFinite(fromCal)) return fromCal;
  return Math.min(100, Math.max(0, Math.round(thesis.scores?.marketMispricingScore ?? 0)));
}

export function meetsUserThesisPromotionThresholds(qualityScore: number, mispricingPct: number): boolean {
  return qualityScore > USER_THESIS_PROMOTION.minQualityScore && mispricingPct > USER_THESIS_PROMOTION.minMispricingPct;
}
