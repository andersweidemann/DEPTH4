import type { Thesis } from "@/lib/thesis-engine-v2/types";

export type ThesisMispricing = {
  score: number; // 0–100 (dummy)
  thesisProbability: number;
  marketImplied: number;
  gap: number;
  explanation: string;
};

type MispricingSeed = { marketImplied: number; explanation: string };

const DEFAULT_SEED: MispricingSeed = {
  marketImplied: 50,
  explanation:
    "Market pricing appears closer to a neutral baseline, while the thesis probability differs based on the current evidence set.",
};

// Dummy MVP: hard-coded per thesis slug (can be refined or moved server-side later).
const SEED_BY_SLUG: Record<string, MispricingSeed> = {
  // Peace thesis (example from UX brief)
  "war-short-peace-gold-short": {
    marketImplied: 40,
    explanation:
      "Market pricing appears to discount a near-term peace deal, while the thesis evidence set assigns a higher probability than current gold pricing implies.",
  },
  // Defense reset thesis (example)
  "defense-reset-repricing": {
    marketImplied: 35,
    explanation:
      "Market pricing appears to treat the reset as low probability, while the thesis probability reflects accumulating confirmation signals and timing compression.",
  },
  // Rates / cuts (example)
  "rate-cuts-not-priced": {
    marketImplied: 50,
    explanation:
      "Market pricing appears closer to a mid-range baseline; the thesis probability expresses a directional view that the market may be under- or over-pricing the next move.",
  },
};

function clampInt(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

function convictionMultiplier(thesis: Thesis) {
  // Dummy: tradeable ideas amplify the gap more than early-stage themes.
  if (thesis.qualification === "tradeable") return 2.0;
  if (thesis.qualification === "emerging") return 1.6;
  return 1.3;
}

export function getThesisMispricing(
  thesis: Thesis,
  options?: { liveEvidenceCount?: number },
): ThesisMispricing {
  const liveN = options?.liveEvidenceCount ?? 0;
  let seed = SEED_BY_SLUG[thesis.slug] ?? DEFAULT_SEED;
  // Catalog slugs get curated seeds; user theses rarely match — still move implied as evidence arrives.
  if (thesis.origin === "user") {
    const drift = Math.min(20, liveN * 5);
    seed = {
      marketImplied: clampInt(54 - drift, 28, 78),
      explanation:
        liveN > 0
          ? "User thesis: implied pricing nudges as DEPTH4 logs server-matched evidence against your tags — not a live order book; sanity-check vs spot and flows."
          : DEFAULT_SEED.explanation,
    };
  }
  const thesisProbability = clampInt(thesis.probability, 0, 100);
  const marketImplied = clampInt(seed.marketImplied, 0, 100);
  const gap = clampInt(thesisProbability - marketImplied, -100, 100);
  const score = clampInt(Math.abs(gap) * convictionMultiplier(thesis), 0, 100);
  return { score, thesisProbability, marketImplied, gap, explanation: seed.explanation };
}

export function getMispricingSeedBySlug(slug: string): MispricingSeed {
  return SEED_BY_SLUG[slug] ?? DEFAULT_SEED;
}

