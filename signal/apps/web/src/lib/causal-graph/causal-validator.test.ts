import { describe, expect, it } from "vitest";
import { sameTargetAsset, validateThesisEventLink } from "@/lib/causal-graph/causal-validator";
import type { CausalThesis } from "@/types/causal-graph";

const baseEvent = {
  title: "War de-escalation in Eastern Europe",
  category: "geopolitics" as const,
  description: "Ceasefire talks and peace momentum reduce near-term escalation risk.",
};

function thesis(partial: Partial<CausalThesis> & Pick<CausalThesis, "slug" | "title">): CausalThesis {
  return {
    id: partial.slug,
    slug: partial.slug,
    title: partial.title,
    statement: partial.statement ?? partial.title,
    targetAssetSymbol: partial.targetAssetSymbol ?? "GLD",
    direction: partial.direction ?? "down",
    conviction: 50,
    mispricingScore: 50,
    affects: [],
    ...partial,
  };
}

describe("sameTargetAsset", () => {
  it("matches identical symbols", () => {
    expect(sameTargetAsset("GLD", "GLD")).toBe(true);
    expect(sameTargetAsset("rtx", "RTX")).toBe(true);
  });
});

describe("validateThesisEventLink", () => {
  it("rejects same-asset opposite direction in cluster", () => {
    const existing = [
      thesis({
        slug: "gold-short",
        title: "Gold fades on peace",
        targetAssetSymbol: "GLD",
        direction: "down",
      }),
    ];
    const result = validateThesisEventLink(
      {
        slug: "gold-long",
        title: "Gold rips on uncertainty",
        statement: "Safe haven bid returns",
        targetAssetSymbol: "GLD",
        direction: "up",
      },
      baseEvent,
      existing,
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/Contradiction/);
  });

  it("rejects war-benefit thesis under de-escalation event", () => {
    const result = validateThesisEventLink(
      {
        slug: "defense-long",
        title: "Defense spending rises on rearmament",
        statement: "War drives sustained defense spend higher",
        targetAssetSymbol: "LMT",
        direction: "up",
      },
      baseEvent,
      [],
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/Logic mismatch/);
  });

  it("rejects peace-benefit thesis under escalation event", () => {
    const result = validateThesisEventLink(
      {
        slug: "peace-beta",
        title: "Peace dividend for airlines",
        statement: "De-escalation unlocks thaw benefit for travel",
        targetAssetSymbol: "DAL",
        direction: "up",
      },
      {
        title: "Middle East flare-up intensifies",
        category: "geopolitics",
        description: "Escalation risk surges after new strikes",
      },
      [],
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/escalation/);
  });

  it("warns when thesis does not reference event keywords", () => {
    const result = validateThesisEventLink(
      {
        slug: "copper",
        title: "Copper squeeze on mine outages",
        statement: "Supply cuts lift industrial metals",
        targetAssetSymbol: "HG",
        direction: "up",
      },
      {
        title: "Federal Reserve policy pivot",
        category: "monetary_policy",
        description: "Rates path repriced after CPI",
      },
      [],
    );
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("allows different assets with different directions", () => {
    const existing = [
      thesis({
        slug: "gold-short",
        title: "Gold fades",
        targetAssetSymbol: "GLD",
        direction: "down",
      }),
    ];
    const result = validateThesisEventLink(
      {
        slug: "defense-long",
        title: "Defense contractors reprice lower",
        statement: "Budget normalization weighs on primes",
        targetAssetSymbol: "LMT",
        direction: "down",
      },
      baseEvent,
      existing,
    );
    expect(result.valid).toBe(true);
  });
});
