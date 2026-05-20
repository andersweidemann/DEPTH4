import type { ThesisOutcomeKind, ThesisOutcomeRecord, ThesisOutcomeResolvedBy } from "@/types/thesis-outcome";

export type ThesisOutcomeRow = {
  id: string;
  thesis_id: string;
  thesis_slug: string;
  outcome: ThesisOutcomeKind;
  resolved_at: string;
  resolved_by: ThesisOutcomeResolvedBy;
  resolved_price: number | string | null;
  predicted_direction: "up" | "down";
  actual_direction: "up" | "down" | "neutral" | null;
  conviction_at_start: number | null;
  conviction_at_end: number | null;
  hold_duration_days: number | null;
  pnl: number | string | null;
  max_drawdown: number | string | null;
  catalyst: string | null;
  reflection: string | null;
  outcome_category?: string | null;
  actual_return_pct?: number | string | null;
  entry_price?: number | string | null;
  exit_price?: number | string | null;
  target_price?: number | string | null;
  stop_loss_price?: number | string | null;
  thesis_prediction?: string | null;
  what_actually_happened?: string | null;
  narrative_fulfilled?: boolean | null;
  post_mortem?: string | null;
  created_at: string;
};

export function numOrNull(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function mapOutcomeRow(row: ThesisOutcomeRow): ThesisOutcomeRecord {
  return {
    id: row.id,
    thesisId: row.thesis_id,
    thesisSlug: row.thesis_slug,
    outcome: row.outcome,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
    resolvedPrice: numOrNull(row.resolved_price),
    predictedDirection: row.predicted_direction,
    actualDirection: row.actual_direction,
    convictionAtStart: row.conviction_at_start,
    convictionAtEnd: row.conviction_at_end,
    holdDurationDays: row.hold_duration_days,
    pnl: numOrNull(row.pnl),
    maxDrawdown: numOrNull(row.max_drawdown),
    catalyst: row.catalyst,
    reflection: row.reflection,
    createdAt: row.created_at,
  };
}
