import { describe, expect, it } from "vitest";
import {
  catalogResolvedTriplesLookLikeBulkWriterCollapse,
  DEPTH4_REPORTED_BULK_WRITER_COLLAPSE_TRIPLE,
  isReportedBulkWriterCollapseTriple,
} from "@/lib/thesis-engine-v2/catalog-scenario-universal-collapse-guard";
import { SCENARIO_PROBABILITY_SEED_DB } from "@/lib/thesis-engine-v2/thesis-display-scenarios";

describe("catalogResolvedTriplesLookLikeBulkWriterCollapse", () => {
  it("detects many identical 80/15/5 non-seed triples", () => {
    const t = DEPTH4_REPORTED_BULK_WRITER_COLLAPSE_TRIPLE;
    expect(catalogResolvedTriplesLookLikeBulkWriterCollapse([t, t, t, t])).toBe(true);
    expect(isReportedBulkWriterCollapseTriple(t)).toBe(true);
  });

  it("does not fire on fewer than four material triples", () => {
    const t = DEPTH4_REPORTED_BULK_WRITER_COLLAPSE_TRIPLE;
    expect(catalogResolvedTriplesLookLikeBulkWriterCollapse([t, t, t])).toBe(false);
  });

  it("ignores seed triples in the count", () => {
    const t = DEPTH4_REPORTED_BULK_WRITER_COLLAPSE_TRIPLE;
    expect(
      catalogResolvedTriplesLookLikeBulkWriterCollapse([SCENARIO_PROBABILITY_SEED_DB, SCENARIO_PROBABILITY_SEED_DB, t, t, t]),
    ).toBe(false);
  });

  it("does not fire when triples differ", () => {
    const a = DEPTH4_REPORTED_BULK_WRITER_COLLAPSE_TRIPLE;
    const b = { base: 33, bull: 44, bear: 23 };
    expect(catalogResolvedTriplesLookLikeBulkWriterCollapse([a, a, a, b])).toBe(false);
  });
});
