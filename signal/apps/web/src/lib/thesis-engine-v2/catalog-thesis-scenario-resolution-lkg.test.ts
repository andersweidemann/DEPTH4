import { describe, expect, it } from "vitest";
import { mergeCatalogDbScenarioColumnWithEvidenceFallback } from "@/lib/thesis-engine-v2/catalog-thesis-titles-server";
import { SCENARIO_PROBABILITY_SEED_DB } from "@/lib/thesis-engine-v2/thesis-display-scenarios";

/**
 * Encodes the 80e0659-era contract: `fetchCatalogThesisHeaderBySlug` (and now list + catalog-titles) must not
 * treat the shared DB **seed** triple as authoritative — lift per-thesis evidence instead. Without this, batch
 * list hydration and client `catalog-titles` stayed on the column while slug detail SSR used evidence, and
 * surfaces could still collapse together if the column was overwritten with one bad non-seed triple everywhere.
 */
describe("catalog thesis scenario resolution (LKG parity)", () => {
  it("replaces shared seed column with per-thesis evidence triple when present", () => {
    const evidence = { base: 33, bull: 44, bear: 23 };
    const out = mergeCatalogDbScenarioColumnWithEvidenceFallback(SCENARIO_PROBABILITY_SEED_DB, evidence);
    expect(out).toEqual(evidence);
  });

  it("keeps a non-seed column triple and ignores evidence (same rule as slug header fetch)", () => {
    const column = { base: 80, bull: 15, bear: 5 };
    const evidence = { base: 10, bull: 70, bear: 20 };
    const out = mergeCatalogDbScenarioColumnWithEvidenceFallback(column, evidence);
    expect(out).toEqual(column);
  });

  it("returns null when column absent and evidence null", () => {
    expect(mergeCatalogDbScenarioColumnWithEvidenceFallback(null, null)).toBeNull();
  });
});
