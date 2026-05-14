import type { PipelineStage, ThesisPipelineTraceRow } from "@/lib/thesis-pipeline-audit/types";

export type StageRollup = {
  reached: boolean;
  ok: boolean;
  lastAt: string | null;
  status: string | null;
  reason_code: string | null;
  detail: string | null;
  thesis_candidate_id: string | null;
  thesis_id: string | null;
  model: string | null;
  prompt_version: string | null;
};

const EMPTY_STAGE: StageRollup = {
  reached: false,
  ok: false,
  lastAt: null,
  status: null,
  reason_code: null,
  detail: null,
  thesis_candidate_id: null,
  thesis_id: null,
  model: null,
  prompt_version: null,
};

/** Latest trace row wins per stage (same stage may be re-emitted on retries). */
export function rollupTracesForCluster(traces: ThesisPipelineTraceRow[]): Record<PipelineStage, StageRollup> {
  const byStage = new Map<string, ThesisPipelineTraceRow>();
  const sorted = [...traces].sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const t of sorted) {
    byStage.set(t.stage, t);
  }

  const stages: PipelineStage[] = [
    "ingested",
    "clustered",
    "discovery_promoted",
    "reasoned",
    "candidate_created",
    "validation",
    "thesis_promoted",
    "surfaced_ui",
  ];

  const out = {} as Record<PipelineStage, StageRollup>;
  for (const s of stages) {
    const row = byStage.get(s);
    if (!row) {
      out[s] = { ...EMPTY_STAGE };
      continue;
    }
    out[s] = {
      reached: true,
      ok: row.status === "ok",
      lastAt: row.created_at,
      status: row.status,
      reason_code: row.reason_code,
      detail: row.detail,
      thesis_candidate_id: row.thesis_candidate_id,
      thesis_id: row.thesis_id,
      model: row.model,
      prompt_version: row.prompt_version,
    };
  }
  return out;
}

export type PipelineHealthCounters = {
  ingested: number;
  clustered: number;
  discovery_promoted: number;
  reasoned_ok: number;
  candidate_created: number;
  validation_ok: number;
  validation_rejected: number;
  thesis_promoted: number;
  surfaced_ui: number;
};

export function emptyHealthCounters(): PipelineHealthCounters {
  return {
    ingested: 0,
    clustered: 0,
    discovery_promoted: 0,
    reasoned_ok: 0,
    candidate_created: 0,
    validation_ok: 0,
    validation_rejected: 0,
    thesis_promoted: 0,
    surfaced_ui: 0,
  };
}

export function addRollupToCounters(c: PipelineHealthCounters, r: Record<PipelineStage, StageRollup>) {
  if (r.ingested.reached && r.ingested.ok) c.ingested += 1;
  if (r.clustered.reached && r.clustered.ok) c.clustered += 1;
  if (r.discovery_promoted.reached && r.discovery_promoted.ok) c.discovery_promoted += 1;
  if (r.reasoned.reached && r.reasoned.ok) c.reasoned_ok += 1;
  if (r.candidate_created.reached && r.candidate_created.ok) c.candidate_created += 1;
  if (r.validation.reached) {
    if (r.validation.ok) c.validation_ok += 1;
    else if (r.validation.status === "rejected") c.validation_rejected += 1;
  }
  if (r.thesis_promoted.reached && r.thesis_promoted.ok) c.thesis_promoted += 1;
  if (r.surfaced_ui.reached && r.surfaced_ui.ok) c.surfaced_ui += 1;
}

export type BottleneckHint = { severity: "warn" | "info"; message: string };

export function detectBottlenecks(counters: PipelineHealthCounters): BottleneckHint[] {
  const hints: BottleneckHint[] = [];
  if (counters.reasoned_ok > 0 && counters.thesis_promoted === 0 && counters.validation_rejected > 0) {
    hints.push({
      severity: "warn",
      message: "Reasoning completes but thesis promotion is zero — validation is rejecting registry inserts.",
    });
  }
  if (counters.reasoned_ok > 0 && counters.thesis_promoted === 0 && counters.validation_rejected === 0) {
    hints.push({
      severity: "warn",
      message: "Reasoning active but promotion zero — check candidate_created / validation stages or DB errors.",
    });
  }
  if (counters.clustered > 2 && counters.discovery_promoted === 0) {
    hints.push({
      severity: "info",
      message: "Clusters formed but none promoted — tighten promotion gates or raise DAILY_PROMOTION_LIMIT.",
    });
  }
  if (counters.thesis_promoted > 0 && counters.surfaced_ui === 0) {
    hints.push({
      severity: "info",
      message: "Theses created but map surfacing is zero — surfacing quality bar may be failing post-insert.",
    });
  }
  return hints;
}

/**
 * Where the pipeline last stopped for a cluster (first stage from the bottom that is not OK completed path).
 */
export function pipelineHaltSummary(r: Record<PipelineStage, StageRollup>): {
  haltedAt: PipelineStage | "none";
  why: string | null;
} {
  const order: PipelineStage[] = [
    "ingested",
    "clustered",
    "discovery_promoted",
    "reasoned",
    "candidate_created",
    "validation",
    "thesis_promoted",
    "surfaced_ui",
  ];

  let lastOkIndex = -1;
  for (let i = 0; i < order.length; i++) {
    const st = r[order[i]];
    if (st.reached && st.ok) lastOkIndex = i;
  }

  for (let i = lastOkIndex + 1; i < order.length; i++) {
    const st = order[i];
    const row = r[st];
    if (row.reached && !row.ok) {
      const why = [row.reason_code, row.detail].filter(Boolean).join(" — ") || row.status || "unknown";
      return { haltedAt: st, why };
    }
    if (!row.reached) {
      return {
        haltedAt: st,
        why: "No trace rows for this stage yet (pipeline not scheduled or still queued).",
      };
    }
  }

  return { haltedAt: "none", why: null };
}
