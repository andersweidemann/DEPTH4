import type { PipelineStage, ThesisPipelineTraceRow } from "@/lib/thesis-pipeline-audit/types";

function row(p: Partial<ThesisPipelineTraceRow> & Pick<ThesisPipelineTraceRow, "cluster_id" | "stage" | "status">): ThesisPipelineTraceRow {
  return {
    id: p.id ?? `trace-${p.cluster_id}-${p.stage}-${p.created_at ?? "0"}`,
    cluster_id: p.cluster_id,
    news_event_id: p.news_event_id ?? null,
    stage: p.stage,
    status: p.status,
    reason_code: p.reason_code ?? null,
    detail: p.detail ?? null,
    thesis_candidate_id: p.thesis_candidate_id ?? null,
    thesis_id: p.thesis_id ?? null,
    model: p.model ?? null,
    prompt_version: p.prompt_version ?? null,
    source_tier_mix: p.source_tier_mix ?? null,
    meta: p.meta ?? {},
    created_at: p.created_at ?? new Date().toISOString(),
  };
}

const CID_OK = "00000000-0000-4000-8000-000000000001";
const CID_REJECT = "00000000-0000-4000-8000-000000000002";
const CID_AMBIG = "00000000-0000-4000-8000-000000000003";
/** Target steady state after generator + registry-repair upgrade (same shape as full_success, different id). */
const CID_UPGRADE = "00000000-0000-4000-8000-000000000004";

/** Golden-path synthetic traces for unit tests (stable cluster IDs). */
export const THESIS_PIPELINE_FIXTURE_TRACES: Record<string, ThesisPipelineTraceRow[]> = {
  full_success: [
    row({ cluster_id: CID_OK, stage: "ingested", status: "ok", created_at: "2026-01-01T00:00:00.000Z" }),
    row({ cluster_id: CID_OK, stage: "clustered", status: "ok", created_at: "2026-01-01T00:00:01.000Z" }),
    row({ cluster_id: CID_OK, stage: "discovery_promoted", status: "ok", created_at: "2026-01-01T00:00:02.000Z" }),
    row({
      cluster_id: CID_OK,
      news_event_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      stage: "reasoned",
      status: "ok",
      model: "claude-3-5-sonnet",
      prompt_version: "macro_v9",
      source_tier_mix: { "3": 2, "4": 1 },
      created_at: "2026-01-01T00:00:10.000Z",
    }),
    row({
      cluster_id: CID_OK,
      news_event_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      stage: "candidate_created",
      status: "ok",
      thesis_candidate_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      created_at: "2026-01-01T00:00:11.000Z",
    }),
    row({
      cluster_id: CID_OK,
      stage: "validation",
      status: "ok",
      created_at: "2026-01-01T00:00:12.000Z",
    }),
    row({
      cluster_id: CID_OK,
      stage: "thesis_promoted",
      status: "ok",
      thesis_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      created_at: "2026-01-01T00:00:13.000Z",
    }),
    row({
      cluster_id: CID_OK,
      stage: "surfaced_ui",
      status: "ok",
      thesis_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      created_at: "2026-01-01T00:00:14.000Z",
    }),
  ],

  /**
   * Encodes post-upgrade success: validation ok after DEPTH4-style hero (non-headline) path.
   * validation.meta.registry_repair_attempted documents optional second LLM pass.
   */
  depth4_post_generator_upgrade: [
    row({ cluster_id: CID_UPGRADE, stage: "ingested", status: "ok", created_at: "2026-02-01T00:00:00.000Z" }),
    row({ cluster_id: CID_UPGRADE, stage: "clustered", status: "ok", created_at: "2026-02-01T00:00:01.000Z" }),
    row({ cluster_id: CID_UPGRADE, stage: "discovery_promoted", status: "ok", created_at: "2026-02-01T00:00:02.000Z" }),
    row({
      cluster_id: CID_UPGRADE,
      news_event_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      stage: "reasoned",
      status: "ok",
      model: "claude-opus-4-7",
      prompt_version: "macro-reasoning-plain-v18",
      created_at: "2026-02-01T00:00:10.000Z",
    }),
    row({
      cluster_id: CID_UPGRADE,
      news_event_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      stage: "candidate_created",
      status: "ok",
      thesis_candidate_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      created_at: "2026-02-01T00:00:11.000Z",
    }),
    row({
      cluster_id: CID_UPGRADE,
      stage: "validation",
      status: "ok",
      meta: { registry_repair_attempted: true, macro_prompt_version: "macro-reasoning-plain-v18" },
      created_at: "2026-02-01T00:00:12.000Z",
    }),
    row({
      cluster_id: CID_UPGRADE,
      stage: "thesis_promoted",
      status: "ok",
      thesis_id: "99999999-9999-4999-8999-999999999999",
      created_at: "2026-02-01T00:00:13.000Z",
    }),
    row({
      cluster_id: CID_UPGRADE,
      stage: "surfaced_ui",
      status: "ok",
      thesis_id: "99999999-9999-4999-8999-999999999999",
      created_at: "2026-02-01T00:00:14.000Z",
    }),
  ],

  registry_rejected: [
    row({ cluster_id: CID_REJECT, stage: "ingested", status: "ok", created_at: "2026-01-02T00:00:00.000Z" }),
    row({ cluster_id: CID_REJECT, stage: "clustered", status: "ok", created_at: "2026-01-02T00:00:01.000Z" }),
    row({ cluster_id: CID_REJECT, stage: "discovery_promoted", status: "ok", created_at: "2026-01-02T00:00:02.000Z" }),
    row({ cluster_id: CID_REJECT, stage: "reasoned", status: "ok", created_at: "2026-01-02T00:00:10.000Z" }),
    row({
      cluster_id: CID_REJECT,
      stage: "candidate_created",
      status: "ok",
      thesis_candidate_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      created_at: "2026-01-02T00:00:11.000Z",
    }),
    row({
      cluster_id: CID_REJECT,
      stage: "validation",
      status: "rejected",
      reason_code: "missing_mispricing",
      detail: "reject_mispricing_not_specific",
      created_at: "2026-01-02T00:00:12.000Z",
    }),
    row({
      cluster_id: CID_REJECT,
      stage: "thesis_promoted",
      status: "skipped",
      reason_code: "missing_mispricing",
      created_at: "2026-01-02T00:00:12.100Z",
    }),
    row({
      cluster_id: CID_REJECT,
      stage: "surfaced_ui",
      status: "skipped",
      detail: "no_ai_generated_thesis_row",
      created_at: "2026-01-02T00:00:12.200Z",
    }),
  ],

  /** Clustered but not yet promoted — still in evaluation queue. */
  evaluating: [
    row({ cluster_id: CID_AMBIG, stage: "ingested", status: "ok", created_at: "2026-01-03T00:00:00.000Z" }),
    row({ cluster_id: CID_AMBIG, stage: "clustered", status: "ok", created_at: "2026-01-03T00:00:01.000Z" }),
  ],
};

export const THESIS_PIPELINE_FIXTURE_EXPECTATIONS: Array<{
  name: string;
  cluster_id: string;
  traces: ThesisPipelineTraceRow[];
  expect: {
    haltAt: PipelineStage | "none";
    thesis_promoted_ok: boolean;
    surfaced_ok: boolean;
  };
}> = [
  {
    name: "full_success",
    cluster_id: CID_OK,
    traces: THESIS_PIPELINE_FIXTURE_TRACES.full_success,
    expect: { haltAt: "none", thesis_promoted_ok: true, surfaced_ok: true },
  },
  {
    name: "depth4_post_generator_upgrade",
    cluster_id: CID_UPGRADE,
    traces: THESIS_PIPELINE_FIXTURE_TRACES.depth4_post_generator_upgrade,
    expect: { haltAt: "none", thesis_promoted_ok: true, surfaced_ok: true },
  },
  {
    name: "registry_rejected",
    cluster_id: CID_REJECT,
    traces: THESIS_PIPELINE_FIXTURE_TRACES.registry_rejected,
    expect: { haltAt: "validation", thesis_promoted_ok: false, surfaced_ok: false },
  },
  {
    name: "evaluating",
    cluster_id: CID_AMBIG,
    traces: THESIS_PIPELINE_FIXTURE_TRACES.evaluating,
    expect: { haltAt: "discovery_promoted", thesis_promoted_ok: false, surfaced_ok: false },
  },
];
