import type { SupabaseClient } from "@supabase/supabase-js";

/** Stages emitted by workers (stable contract for audit UI + tests). */
export const PIPELINE_STAGES = [
  "ingested",
  "clustered",
  "discovery_promoted",
  "reasoned",
  "candidate_created",
  "validation",
  "thesis_promoted",
  "surfaced_ui",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const PIPELINE_STATUSES = ["ok", "pending", "skipped", "rejected", "error"] as const;
export type PipelineStatus = (typeof PIPELINE_STATUSES)[number];

/** User-facing rejection buckets (plus infra / unknown). */
export const PIPELINE_REJECTION_CODES = [
  "headline_rewrite",
  "generic_analyst_note",
  "missing_l3_l4",
  "missing_mispricing",
  "insufficient_source_confirmation",
  "duplicate_narrative",
  "weak_tradable_implication",
  "infra_llm",
  "infra_schema",
  "infra_db",
  "other",
] as const;

export type PipelineRejectionCode = (typeof PIPELINE_REJECTION_CODES)[number];

export type ThesisPipelineTraceInsert = {
  cluster_id: string;
  news_event_id?: string | null;
  stage: PipelineStage | string;
  status: PipelineStatus | string;
  reason_code?: string | null;
  detail?: string | null;
  thesis_candidate_id?: string | null;
  thesis_id?: string | null;
  model?: string | null;
  prompt_version?: string | null;
  source_tier_mix?: Record<string, number> | null;
  meta?: Record<string, unknown>;
};

export type ThesisPipelineTraceRow = {
  id: string;
  cluster_id: string;
  news_event_id: string | null;
  stage: string;
  status: string;
  reason_code: string | null;
  detail: string | null;
  thesis_candidate_id: string | null;
  thesis_id: string | null;
  model: string | null;
  prompt_version: string | null;
  source_tier_mix: Record<string, number> | null;
  meta: Record<string, unknown>;
  created_at: string;
};

export type SupabaseAdmin = SupabaseClient;

export function thesisPipelineTraceFromDb(raw: unknown): ThesisPipelineTraceRow | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const cluster_id = typeof o.cluster_id === "string" ? o.cluster_id : "";
  const stage = typeof o.stage === "string" ? o.stage : "";
  const status = typeof o.status === "string" ? o.status : "";
  const created_at = typeof o.created_at === "string" ? o.created_at : "";
  if (!cluster_id || !stage || !status || !created_at) return null;

  const metaRaw = o.meta;
  const meta =
    metaRaw && typeof metaRaw === "object" && !Array.isArray(metaRaw) ? (metaRaw as Record<string, unknown>) : {};

  let source_tier_mix: Record<string, number> | null = null;
  const mixRaw = o.source_tier_mix;
  if (mixRaw && typeof mixRaw === "object" && !Array.isArray(mixRaw)) {
    const m: Record<string, number> = {};
    for (const [k, v] of Object.entries(mixRaw as Record<string, unknown>)) {
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(n)) m[k] = n;
    }
    source_tier_mix = m;
  }

  return {
    id: typeof o.id === "string" ? o.id : String(o.id ?? ""),
    cluster_id,
    news_event_id: typeof o.news_event_id === "string" ? o.news_event_id : null,
    stage,
    status,
    reason_code: typeof o.reason_code === "string" ? o.reason_code : null,
    detail: typeof o.detail === "string" ? o.detail : null,
    thesis_candidate_id: typeof o.thesis_candidate_id === "string" ? o.thesis_candidate_id : null,
    thesis_id: typeof o.thesis_id === "string" ? o.thesis_id : null,
    model: typeof o.model === "string" ? o.model : null,
    prompt_version: typeof o.prompt_version === "string" ? o.prompt_version : null,
    source_tier_mix,
    meta,
    created_at,
  };
}
