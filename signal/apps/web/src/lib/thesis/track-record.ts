import type {
  OutcomeCategory,
  ThesisOutcomeKind,
  TrackRecord,
  TrackRecordCategoryRow,
  TrackRecordMonthRow,
  TrackRecordResolvedThesisRow,
} from "@/types/thesis-outcome";
import { OUTCOME_CATEGORY_LABELS } from "@/types/thesis-outcome";
import { mapOutcomeRow, type ThesisOutcomeRow } from "@/lib/thesis/thesis-outcome-db";

type OutcomeWithThesisRow = ThesisOutcomeRow & {
  outcome_category?: string | null;
  actual_return_pct?: number | string | null;
  post_mortem?: string | null;
  theses?: {
    title?: string | null;
    micro_label?: string | null;
    slug?: string | null;
    asset?: string | null;
    insider_flow?: { asset?: string } | null;
    body?: unknown;
  } | null;
  event_category?: string | null;
};

function inferOutcomeCategory(outcome: ThesisOutcomeKind): OutcomeCategory | null {
  if (outcome === "won_clean" || outcome === "won_messy") return "target_hit";
  if (outcome === "failed") return "stop_hit";
  if (outcome === "expired") return "time_expired";
  return null;
}

function isWin(outcome: ThesisOutcomeKind): boolean {
  return outcome === "won_clean" || outcome === "won_messy";
}

function monthKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function assetFromRow(row: OutcomeWithThesisRow): string {
  const body = row.theses?.body;
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const o = body as Record<string, unknown>;
    const a = o.target_asset ?? o.asset ?? o.targetAsset;
    if (typeof a === "string" && a.trim() && a !== "—") return a.trim();
  }
  const flow = row.theses?.insider_flow;
  if (flow && typeof flow === "object" && "asset" in flow && typeof flow.asset === "string") {
    return flow.asset;
  }
  return "—";
}

export function buildTrackRecord(rows: OutcomeWithThesisRow[]): TrackRecord {
  let wonClean = 0;
  let wonMessy = 0;
  let failed = 0;
  let expired = 0;
  let withdrawn = 0;
  let superseded = 0;
  let holdSum = 0;
  let holdCount = 0;
  let returnSum = 0;
  let returnCount = 0;
  let targetHits = 0;
  let stopHits = 0;

  const byCategoryMap = new Map<string, { total: number; won: number }>();
  const monthMap = new Map<string, TrackRecordMonthRow>();

  for (const row of rows) {
    switch (row.outcome) {
      case "won_clean":
        wonClean += 1;
        break;
      case "won_messy":
        wonMessy += 1;
        break;
      case "failed":
        failed += 1;
        break;
      case "expired":
        expired += 1;
        break;
      case "withdrawn":
        withdrawn += 1;
        break;
      case "superseded":
        superseded += 1;
        break;
      default:
        break;
    }

    if (row.hold_duration_days != null) {
      holdSum += row.hold_duration_days;
      holdCount += 1;
    }

    const actualRet =
      row.actual_return_pct != null
        ? typeof row.actual_return_pct === "number"
          ? row.actual_return_pct
          : Number(row.actual_return_pct)
        : null;
    const pnl = typeof row.pnl === "number" ? row.pnl : row.pnl != null ? Number(row.pnl) : null;
    const ret = actualRet != null && Number.isFinite(actualRet) ? actualRet : pnl;
    if (ret != null && Number.isFinite(ret)) {
      returnSum += ret;
      returnCount += 1;
    }

    const oc =
      (row.outcome_category as OutcomeCategory | null) ?? inferOutcomeCategory(row.outcome);
    if (oc === "target_hit") targetHits += 1;
    if (oc === "stop_hit") stopHits += 1;

    const cat = row.event_category?.trim() || "uncategorized";
    const cur = byCategoryMap.get(cat) ?? { total: 0, won: 0 };
    cur.total += 1;
    if (isWin(row.outcome)) cur.won += 1;
    byCategoryMap.set(cat, cur);

    const mk = monthKey(row.resolved_at);
    const monthRow = monthMap.get(mk) ?? { month: mk, won: 0, failed: 0, expired: 0 };
    if (isWin(row.outcome)) monthRow.won += 1;
    else if (row.outcome === "failed") monthRow.failed += 1;
    else if (row.outcome === "expired") monthRow.expired += 1;
    monthMap.set(mk, monthRow);
  }

  const total = rows.length;
  const wins = wonClean + wonMessy;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

  const byCategory: TrackRecordCategoryRow[] = Array.from(byCategoryMap.entries())
    .map(([category, v]) => ({
      category,
      total: v.total,
      won: v.won,
      winRate: v.total > 0 ? Math.round((v.won / v.total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total);

  const monthlyHistory = Array.from(monthMap.values())
    .sort((a, b) => b.month.localeCompare(a.month))
    .slice(0, 12);

  const resolvedTheses: TrackRecordResolvedThesisRow[] = rows.slice(0, 80).map((row) => {
    const o = mapOutcomeRow(row);
    const title =
      row.theses?.micro_label?.trim() ||
      row.theses?.title?.trim() ||
      row.thesis_slug;
    const outcomeCategory =
      (row.outcome_category as OutcomeCategory | null) ?? inferOutcomeCategory(row.outcome);
    const reflection = (row.reflection ?? "").trim() || null;
    const postMortem = (row.post_mortem ?? reflection ?? "").trim() || null;
    const outcomeCategoryLabel =
      outcomeCategory != null ? OUTCOME_CATEGORY_LABELS[outcomeCategory] : null;
    return {
      thesisId: row.thesis_id,
      slug: row.thesis_slug,
      title,
      asset: assetFromRow(row),
      direction: row.predicted_direction === "up" ? "long" : "short",
      outcome: o.outcome,
      outcomeCategory,
      outcomeCategoryLabel,
      resolvedAt: o.resolvedAt,
      holdDurationDays: o.holdDurationDays,
      pnl: o.pnl,
      reflection,
      postMortem,
    };
  });

  return {
    total,
    wonClean,
    wonMessy,
    failed,
    expired,
    withdrawn,
    superseded,
    winRate,
    avgHoldDuration: holdCount > 0 ? Math.round(holdSum / holdCount) : null,
    avgReturnPct: returnCount > 0 ? Math.round((returnSum / returnCount) * 10) / 10 : null,
    targetHits,
    stopHits,
    byCategory,
    monthlyHistory,
    resolvedTheses,
  };
}
