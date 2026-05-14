import type { PipelineRejectionCode } from "@/lib/thesis-pipeline-audit/types";

/**
 * Maps internal validation / worker strings to stable audit `reason_code` values
 * (DEPTH4 product vocabulary).
 */
export function mapInternalReasonToPipelineRejection(internal: string): {
  code: PipelineRejectionCode;
  preserved_internal: string;
} {
  const s = internal.trim();
  if (!s) return { code: "other", preserved_internal: internal };

  if (s === "reject_registry_hero_base_bar" || s === "reject_non_causal_hero_for_registry") {
    return { code: "headline_rewrite", preserved_internal: s };
  }
  if (s === "reject_analyst_style_hero") {
    return { code: "generic_analyst_note", preserved_internal: s };
  }
  if (
    s === "reject_reasoning_levels_incomplete" ||
    s === "reject_reasoning_levels_too_thin" ||
    s === "reject_reasoning_l34_generic_filler"
  ) {
    return { code: "missing_l3_l4", preserved_internal: s };
  }
  if (s === "reject_missing_explicit_mispricing_signal" || s === "reject_mispricing_not_specific") {
    return { code: "missing_mispricing", preserved_internal: s };
  }
  if (s === "reject_reasoning_level_echoes_hero" || s === "reject_reasoning_level_duplicate_body") {
    return { code: "duplicate_narrative", preserved_internal: s };
  }
  if (
    s === "reject_hero_not_macro_tradable_asset" ||
    s === "reject_hero_not_causal_forecast" ||
    s === "reject_hero_timing_too_vague" ||
    s === "reject_hero_timing_this_year_without_nearer_hook"
  ) {
    return { code: "weak_tradable_implication", preserved_internal: s };
  }
  if (s.includes("per_catalog") && s.includes("quality")) {
    return { code: "weak_tradable_implication", preserved_internal: s };
  }
  if (s.startsWith("per_catalog_thesis") || s.includes("per_catalog")) {
    return { code: "insufficient_source_confirmation", preserved_internal: s };
  }
  if (s.includes("json_parse") || s.startsWith("schema:")) {
    return { code: "infra_schema", preserved_internal: s };
  }
  if (s.includes("llm") || s === "llm_failed") {
    return { code: "infra_llm", preserved_internal: s };
  }
  if (s.startsWith("lookup:") || s.startsWith("insert:")) {
    return { code: "infra_db", preserved_internal: s };
  }
  if (s.includes("idempotent_skip") || s.includes("unique_violation") || s.includes("dup_anchor")) {
    return { code: "duplicate_narrative", preserved_internal: s };
  }

  return { code: "other", preserved_internal: s };
}
