import { describe, expect, it } from "vitest";
import { getThesisBySlug } from "@/lib/thesis-engine-v2/catalog-data";
import { normalizeThesisNarrativeFields } from "@/lib/thesis-engine-v2/thesis-db-body";
import { mergeThesis } from "@/lib/thesis-engine-v2/thesis-merge";
import {
  applyThesisNarrativeProbabilityGuardToThesis,
  listThesisNarrativeProbabilityViolations,
  narrativeTextStillHasStandalonePercentToken,
  repairLongFormNarrativeField,
  stripEmbeddedProbabilityPhrasesFromText,
} from "@/lib/thesis-engine-v2/thesis-narrative-probability-guard";
import { getThesisMispricing } from "@/lib/thesis-engine-v2/mispricing";
import type { Thesis } from "@/lib/thesis-engine-v2/types";

describe("stripEmbeddedProbabilityPhrasesFromText", () => {
  it("removes gold-style trailing ', probability 67%.'", () => {
    const raw =
      "Gold will fall as steady talks and fewer escalation headlines unwind war-risk premium within the next several weeks, probability 67%.";
    const out = stripEmbeddedProbabilityPhrasesFromText(raw);
    expect(out.toLowerCase()).not.toContain("probability");
    expect(out).not.toMatch(/\d\s*%/);
  });

  it("removes mid-sentence odds phrasing", () => {
    const raw = "This thesis has a 64% chance of working before year-end.";
    const out = stripEmbeddedProbabilityPhrasesFromText(raw);
    expect(out).not.toMatch(/\b64\s*%/);
  });
});

describe("repairLongFormNarrativeField", () => {
  it("repairs gold-style string so no standalone percent token remains", () => {
    const raw =
      "Gold will fall as steady talks and fewer escalation headlines unwind war-risk premium within the next several weeks, probability 67%.";
    const out = repairLongFormNarrativeField(raw);
    expect(narrativeTextStillHasStandalonePercentToken(out)).toBe(false);
    expect(out.endsWith(".")).toBe(true);
  });
});

describe("applyThesisNarrativeProbabilityGuardToThesis", () => {
  it("cleans scenario path prose without changing structured probabilities", () => {
    const base = getThesisBySlug("war-peace-gold-short")!;
    const t: Thesis = mergeThesis(base, {
      scenarioOverrides: {
        base: {
          probability: 30,
          confirmation: "Tape chops through headlines, probability 40%.",
          marketConsequence: "Size lighter until resolution paths stabilize, probability 10%.",
        },
        bull: { probability: 50, confirmation: "Clean print", marketConsequence: "Add" },
        bear: { probability: 20, confirmation: "Broken", marketConsequence: "Exit" },
      },
    });
    const cleaned = applyThesisNarrativeProbabilityGuardToThesis(t);
    expect(cleaned.scenarioOverrides?.base.probability).toBe(30);
    expect(cleaned.scenarioOverrides?.base.confirmation.toLowerCase()).not.toContain("probability");
    expect(cleaned.scenarioOverrides?.base.marketConsequence.toLowerCase()).not.toContain("probability");
  });
});

describe("catalog + normalize pipeline", () => {
  it("gold catalog thesis has no standalone % tokens in narrative after normalize", () => {
    const raw = getThesisBySlug("war-peace-gold-short")!;
    const t = normalizeThesisNarrativeFields(raw);
    expect(listThesisNarrativeProbabilityViolations(t)).toEqual([]);
    expect(narrativeTextStillHasStandalonePercentToken(t.thesisStatement)).toBe(false);
  });

  it("legacy merged thesis_statement is repaired by normalize", () => {
    const raw = getThesisBySlug("war-peace-gold-short")!;
    const dirty = mergeThesis(raw, {
      thesisStatement:
        "Gold will fall as steady talks and fewer escalation headlines unwind war-risk premium within the next several weeks, probability 67%.",
    });
    const t = normalizeThesisNarrativeFields(dirty);
    expect(t.thesisStatement.toLowerCase()).not.toContain("probability 67");
    expect(listThesisNarrativeProbabilityViolations(t)).toEqual([]);
  });

  it("mispricing score stays a separate 0–100 construct from thesis conviction", () => {
    const t = normalizeThesisNarrativeFields(getThesisBySlug("war-peace-gold-short")!);
    const m = getThesisMispricing(t);
    expect(typeof m.score).toBe("number");
    expect(m.score).toBeGreaterThanOrEqual(0);
    expect(m.score).toBeLessThanOrEqual(100);
    expect(m.thesisProbability).toBe(t.probability);
  });
});
