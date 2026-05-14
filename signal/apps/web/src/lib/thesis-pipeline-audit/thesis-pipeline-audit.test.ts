import { describe, expect, it } from "vitest";
import { mapInternalReasonToPipelineRejection } from "@/lib/thesis-pipeline-audit/canonical-reason";
import { pipelineHaltSummary, rollupTracesForCluster } from "@/lib/thesis-pipeline-audit/rollup";
import { THESIS_PIPELINE_FIXTURE_EXPECTATIONS } from "@/lib/thesis-pipeline-audit/thesis-pipeline-audit.fixtures";

describe("mapInternalReasonToPipelineRejection", () => {
  it("maps hero / IR shells to headline_rewrite", () => {
    expect(mapInternalReasonToPipelineRejection("reject_registry_hero_base_bar").code).toBe("headline_rewrite");
    expect(mapInternalReasonToPipelineRejection("reject_non_causal_hero_for_registry").code).toBe("headline_rewrite");
  });

  it("maps analyst deck heroes to generic_analyst_note", () => {
    expect(mapInternalReasonToPipelineRejection("reject_analyst_style_hero").code).toBe("generic_analyst_note");
  });

  it("maps L3/L4 failures to missing_l3_l4", () => {
    expect(mapInternalReasonToPipelineRejection("reject_reasoning_levels_incomplete").code).toBe("missing_l3_l4");
    expect(mapInternalReasonToPipelineRejection("reject_reasoning_l34_generic_filler").code).toBe("missing_l3_l4");
  });

  it("maps mispricing failures", () => {
    expect(mapInternalReasonToPipelineRejection("reject_mispricing_not_specific").code).toBe("missing_mispricing");
  });

  it("prefers weak_tradable for per-catalog quality gate", () => {
    expect(mapInternalReasonToPipelineRejection("per_catalog_thesis_quality: thin").code).toBe("weak_tradable_implication");
  });
});

describe("thesis pipeline rollup fixtures", () => {
  it.each(THESIS_PIPELINE_FIXTURE_EXPECTATIONS)("$name — expected halt and promotion flags", (fx) => {
    const rollup = rollupTracesForCluster(fx.traces);
    const halt = pipelineHaltSummary(rollup);
    expect(halt.haltedAt).toBe(fx.expect.haltAt);
    expect(rollup.thesis_promoted.ok).toBe(fx.expect.thesis_promoted_ok);
    expect(rollup.surfaced_ui.ok).toBe(fx.expect.surfaced_ok);
  });
});
