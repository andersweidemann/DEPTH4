import type { SupabaseAdmin, ThesisPipelineTraceInsert } from "@/lib/thesis-pipeline-audit/types";

/**
 * Best-effort insert: never throws; logs JSON line for log aggregators.
 */
export async function insertThesisPipelineTrace(admin: SupabaseAdmin, row: ThesisPipelineTraceInsert): Promise<void> {
  const meta = row.meta && typeof row.meta === "object" ? row.meta : {};
  const payload = {
    cluster_id: row.cluster_id,
    news_event_id: row.news_event_id ?? null,
    stage: row.stage,
    status: row.status,
    reason_code: row.reason_code ?? null,
    detail: row.detail ? row.detail.slice(0, 4000) : null,
    thesis_candidate_id: row.thesis_candidate_id ?? null,
    thesis_id: row.thesis_id ?? null,
    model: row.model ?? null,
    prompt_version: row.prompt_version ?? null,
    source_tier_mix: row.source_tier_mix ?? null,
    meta: meta as never,
  };

  try {
    const { error } = await admin.from("thesis_pipeline_trace").insert(payload as never);
    if (error) {
      console.warn("[thesis_pipeline_trace] insert_failed", { message: error.message, stage: row.stage });
    }
  } catch (e) {
    console.warn("[thesis_pipeline_trace] insert_exception", {
      stage: row.stage,
      message: e instanceof Error ? e.message : String(e),
    });
  }

  console.info(
    JSON.stringify({
      depth4_pipeline_trace: true,
      cluster_id: payload.cluster_id,
      news_event_id: payload.news_event_id,
      stage: payload.stage,
      status: payload.status,
      reason_code: payload.reason_code,
      thesis_candidate_id: payload.thesis_candidate_id,
      thesis_id: payload.thesis_id,
      model: payload.model,
      prompt_version: payload.prompt_version,
    }),
  );
}

export function signalLevelMixForMemberIds(
  members: Array<{ id: string; signal_level?: number }>,
  memberIds: string[],
): Record<string, number> {
  const byId = new Map(members.map((m) => [m.id, m]));
  const mix: Record<string, number> = {};
  for (const id of memberIds) {
    const ev = byId.get(id);
    const sl = ev && typeof ev.signal_level === "number" && Number.isFinite(ev.signal_level) ? ev.signal_level : 0;
    const k = String(Math.min(4, Math.max(0, Math.round(sl))));
    mix[k] = (mix[k] ?? 0) + 1;
  }
  return mix;
}
