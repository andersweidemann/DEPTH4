/**
 * Thesis-level mispricing headline (qualification totals + scenario nudges). Per-depth mispricing lives on
 * `Thesis.thesisDepthBook.mispricingByDepth` — see `thesis-depth-canonical.ts` and `selectPrimaryTradeNode`.
 */
import type { Thesis } from "@/lib/thesis-engine-v2/types";
import {
  currentThesisProbabilityFromThesis,
  defaultScenarioOverridesFromThesis,
} from "@/lib/thesis-engine-v2/thesis-display-scenarios";

/**
 * DEPTH4 **mispricing score** (headline 0–100) measures how attractive the **trade setup is right now**
 * (timing, how much is still unpriced, trigger/trade clarity). It is **not** thesis conviction (Clean + Messy).
 *
 * **Audit (legacy):** The MVP used `|thesis.probability − seedMarketImplied| × qualificationMultiplier`, with a
 * default implied ~50. After conviction became Clean+Messy, that formula still read `thesis.probability`, so a
 * thesis at 79% conviction next to ~50% implied produced ~58 **even when** the qualification bars summed to 69 —
 * two unrelated numbers. The headline score now **anchors on the same book scores** as “Qualification breakdown”
 * (`thesis.scores.total`), then applies **small** scenario / conviction-residual / evidence nudges so conviction
 * can tilt the dial without mirroring it.
 */
export type MispricingScoreComponent = {
  id: "structural" | "path_shape" | "conviction_alignment" | "live_evidence";
  label: string;
  /** Integer contribution toward the headline score before clamping to 0–100. */
  value: number;
};

export type ThesisMispricing = {
  /** 0–100: attractiveness of the setup now (see module docstring). */
  score: number;
  /** Sum of `components` before clamping to 0–100. */
  rawSum: number;
  /** Explicit breakdown; `value`s sum to `rawSum` (then `score` = clamp). */
  components: MispricingScoreComponent[];
  /** Same dial as hero: Clean win + Messy win. */
  thesisProbability: number;
  /**
   * Sum of the five qualification components (driver, time compression, market hasn’t caught up, trade clarity,
   * trigger clarity) — same total as the “Qualification breakdown” card. Updates when book scores change
   * (generation / editorial / merge), not on every conviction tick.
   */
  structuralSetupScore: number;
  /**
   * `thesisProbability − structuralSetupScore` (percentage points). Positive ≈ live conviction/scenarios ran
   * ahead of the frozen book scores (edge may be messier or more priced); negative ≈ book scores assume a
   * stronger setup than current paths imply.
   */
  convictionVsSetupGap: number;
  explanation: string;
};

type MispricingSeed = { explanation: string };

const DEFAULT_SEED: MispricingSeed = {
  explanation:
    "Mispricing scores the **trade** (timing, what is still unpriced, trigger and plan clarity). Thesis conviction scores whether the **idea** is broadly right. They can diverge: high conviction with only moderate mispricing often means the story is right but part of the move is priced, the path is messy, or execution is noisy.",
};

const SEED_BY_SLUG: Record<string, MispricingSeed> = {
  "war-short-peace-gold-short": {
    explanation:
      "Geopolitical paths can show high conviction while mispricing stays moderate — tail risk is hard to time and peace headlines often reprice in chunks.",
  },
  "defense-reset-repricing": {
    explanation:
      "Defense dollars can be visible in filings before the tape fully reprices; conviction can lead while award timing still caps how clean the entry is.",
  },
  "rate-cuts-not-priced": {
    explanation:
      "Rates theses often split **curve vs Fed tone**; conviction can track the macro read while mispricing reflects how much of that is already in price and how choppy data windows are.",
  },
  "fed-pivot-delayed-tlt-weakness": {
    explanation:
      "Futures can still lean dovish while prints and speakers stay firm — conviction can be high because Clean+Messy dominates, while mispricing reflects how much of the late-cut repricing is already in TLT and how violent data rips can be between prints.",
  },
};

function clampInt(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

/** How resolution-path shape nudges “attractiveness now” (bounded). */
function scenarioPathAttractivenessNudge(thesis: Thesis): number {
  const o = thesis.scenarioOverrides ?? defaultScenarioOverridesFromThesis(thesis);
  const clean = o.bull.probability;
  const messy = o.base.probability;
  const broken = o.bear.probability;
  let n = 0;
  if (messy >= clean + 8) n -= Math.min(4, Math.round((messy - clean - 6) / 6));
  if (clean >= messy + 8) n += Math.min(3, Math.round((clean - messy - 6) / 7));
  if (broken >= 32) n -= Math.min(3, Math.round((broken - 28) / 4));
  return n;
}

/**
 * When live conviction diverges from frozen book scores, apply a **small** tilt (evidence moved paths; book
 * scores are not recomputed every snapshot). Capped so changing conviction alone cannot swing the headline
 * by double digits.
 */
function convictionResidualNudge(conviction: number, structural: number): number {
  const d = conviction - structural;
  if (d >= 12) return Math.min(6, Math.round(d * 0.12));
  if (d <= -12) return Math.max(-5, Math.round(d * 0.12));
  return Math.round(d * 0.08);
}

function userLiveEvidenceNudge(origin: Thesis["origin"] | undefined, liveEvidenceCount: number): number {
  if (origin !== "user") return 0;
  return Math.min(4, liveEvidenceCount);
}

export function getThesisMispricing(thesis: Thesis, options?: { liveEvidenceCount?: number }): ThesisMispricing {
  const liveN = options?.liveEvidenceCount ?? 0;
  const seed = SEED_BY_SLUG[thesis.slug] ?? DEFAULT_SEED;

  const structuralSetupScore = clampInt(thesis.scores.total, 0, 100);
  const thesisProbability = clampInt(currentThesisProbabilityFromThesis(thesis), 0, 100);
  const convictionVsSetupGap = clampInt(thesisProbability - structuralSetupScore, -100, 100);

  const nScenario = scenarioPathAttractivenessNudge(thesis);
  const nConv = convictionResidualNudge(thesisProbability, structuralSetupScore);
  const nEv = userLiveEvidenceNudge(thesis.origin, liveN);

  const components: MispricingScoreComponent[] = [
    { id: "structural", label: "Structural setup (book scores)", value: structuralSetupScore },
    { id: "path_shape", label: "Resolution path shape", value: nScenario },
    { id: "conviction_alignment", label: "Conviction alignment vs book", value: nConv },
    { id: "live_evidence", label: "Live evidence freshness", value: nEv },
  ];
  const rawSum = components.reduce((a, c) => a + c.value, 0);
  const score = clampInt(rawSum, 0, 100);

  if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
    const chk = components.reduce((a, c) => a + c.value, 0);
    if (chk !== rawSum) throw new Error("mispricing component sum drift");
  }

  return {
    score,
    rawSum,
    components,
    thesisProbability,
    structuralSetupScore,
    convictionVsSetupGap,
    explanation: seed.explanation,
  };
}

/** @deprecated Seeds no longer carry a synthetic “market implied %”; kept for slug → explainer copy. */
export function getMispricingSeedBySlug(slug: string): MispricingSeed {
  return SEED_BY_SLUG[slug] ?? DEFAULT_SEED;
}
