import { describe, expect, it } from "vitest";
import {
  mergeCatalogDbScenarioColumnWithEvidenceFallback,
  pickLatestNonSeedEvidenceTripleFromDescendingRows,
} from "@/lib/thesis-engine-v2/catalog-thesis-titles-server";
import { SCENARIO_PROBABILITY_SEED_DB } from "@/lib/thesis-engine-v2/thesis-display-scenarios";
import {
  shouldInsertMechanismWeakEvidenceLogRow,
  shouldInsertThesisNewsEvidenceLogRow,
  shouldRunThesisNewsThesesTableScenarioUpdate,
} from "@/lib/thesis-engine-v2/thesis-news-writer-policy";

/**
 * Regression for the **2b642e4** writer bug: null-top `thesis_evidence_log` rows + auto-apply stamping identical
 * `scenario_probabilities` onto every `seeded_system` row. Encodes policy + read merge so it cannot return silently.
 */
describe("thesis-news + catalog scenario regression (2b642e4)", () => {
  const suggestion = { bump: 7, next: { base: 80, bull: 15, bear: 5 } };

  it("does not insert NEWS_DEVELOPMENT evidence when there is no modeled suggestion", () => {
    expect(shouldInsertThesisNewsEvidenceLogRow(null)).toBe(false);
  });

  it("inserts NEWS_DEVELOPMENT evidence when a modeled suggestion exists", () => {
    expect(shouldInsertThesisNewsEvidenceLogRow(suggestion)).toBe(true);
  });

  it("inserts flat weak evidence when mechanism gate is log-only", () => {
    expect(shouldInsertMechanismWeakEvidenceLogRow({ logOnly: true, allowed: false })).toBe(true);
    expect(shouldInsertMechanismWeakEvidenceLogRow({ logOnly: false, allowed: true })).toBe(false);
    expect(shouldInsertMechanismWeakEvidenceLogRow({ logOnly: true, allowed: true })).toBe(false);
  });

  it("does not run theses.scenario_probabilities update for seeded_system even when auto-apply would fire", () => {
    expect(
      shouldRunThesisNewsThesesTableScenarioUpdate({
        thesisOrigin: "seeded_system",
        shouldApply: true,
        suggestion,
      }),
    ).toBe(false);
  });

  it("still runs theses.scenario_probabilities update for user theses when auto-apply fires", () => {
    expect(
      shouldRunThesisNewsThesesTableScenarioUpdate({
        thesisOrigin: "user",
        shouldApply: true,
        suggestion,
      }),
    ).toBe(true);
  });

  it("does not stamp the column when suggestion is missing even for user origin", () => {
    expect(
      shouldRunThesisNewsThesesTableScenarioUpdate({
        thesisOrigin: "user",
        shouldApply: true,
        suggestion: null,
      }),
    ).toBe(false);
  });

  it("after seed column + per-thesis evidence, read merge prefers evaluated evidence triple", () => {
    const evaluated = { base: 52, bull: 38, bear: 10 };
    expect(mergeCatalogDbScenarioColumnWithEvidenceFallback(SCENARIO_PROBABILITY_SEED_DB, evaluated)).toEqual(evaluated);
  });

  it("read scan: newer NULL probability_after does not block an older non-seed triple", () => {
    const evaluated = { base: 33, bull: 44, bear: 23 };
    expect(
      pickLatestNonSeedEvidenceTripleFromDescendingRows([
        { probability_after: null },
        { probability_after: evaluated },
      ]),
    ).toEqual(evaluated);
  });
});
