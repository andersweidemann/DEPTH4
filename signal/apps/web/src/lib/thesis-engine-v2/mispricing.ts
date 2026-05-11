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
    "Market-implied odds sit near a neutral baseline; thesis conviction from DEPTH4 can diverge from that implied view. Mispricing score is separate from conviction — it reflects how attractive the setup looks now (timing, underreaction, trigger and trade clarity), not only whether the story is broadly right.",
};

// Dummy MVP: hard-coded per thesis slug (can be refined or moved server-side later).
const SEED_BY_SLUG: Record<string, MispricingSeed> = {
  // Peace thesis (example from UX brief)
  "war-short-peace-gold-short": {
    marketImplied: 40,
    explanation:
      "Implied pricing still embeds more tail-risk than a steady peace track suggests; thesis conviction can be higher while mispricing stays moderate if the edge is messy, late, or already partly priced.",
  },
  // Defense reset thesis (example)
  "defense-reset-repricing": {
    marketImplied: 35,
    explanation:
      "Implied odds treat the defense reset as still unlikely; thesis conviction can run higher as evidence stacks, without forcing mispricing to max — clarity on timing and flow still matters for the score.",
  },
  // Rates / cuts (example)
  "rate-cuts-not-priced": {
    marketImplied: 50,
    explanation:
      "Implied pricing sits mid-range; thesis conviction encodes a directional read on cuts that can diverge from futures. Mispricing stays its own dial — high conviction with only moderate mispricing is normal when part of the story is priced.",
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
          ? "User thesis: implied pricing nudges as DEPTH4 logs server-matched evidence against your tags — conviction can move separately from this mispricing score; sanity-check vs spot and flows."
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

