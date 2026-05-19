import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getDowngradeStatusForScore,
  getMinQualityScoreForStatus,
  isThesisStatusPromotion,
  qualityChecksToJson,
  runQualityGate,
  type QualityReport,
} from "@/lib/thesis/quality-gate";
import { loadQualityGateContext } from "@/lib/thesis/load-quality-gate-context";

export type QualityGateErrorCode = "quality_gate_failed" | "quality_score_too_low";

export type QualityGateBlockResult = {
  ok: false;
  code: QualityGateErrorCode;
  report: QualityReport;
  message: string;
  downgradeTo?: string;
  required?: number;
};

export type QualityGateOkResult = {
  ok: true;
  report: QualityReport;
  patch: {
    quality_score: number;
    quality_checks: unknown;
    promotion_blocked_reason: string | null;
    promoted_at?: string;
  };
};

export type QualityGateEnforceResult = QualityGateOkResult | QualityGateBlockResult;

export async function enforceThesisQualityGate(
  supabase: SupabaseClient,
  thesisId: string,
  currentStatus: string,
  newStatus: string,
): Promise<QualityGateEnforceResult> {
  const ctx = await loadQualityGateContext(supabase, thesisId);
  if (!ctx) {
    return {
      ok: false,
      code: "quality_gate_failed",
      report: { score: 0, checks: [], canPromote: false, blockers: ["not_found"], promotionTarget: "watch" },
      message: "Thesis not found",
    };
  }

  const report = runQualityGate(ctx.input, ctx.cluster, ctx.peers);

  if (isThesisStatusPromotion(currentStatus, newStatus)) {
    if (!report.canPromote) {
      return {
        ok: false,
        code: "quality_gate_failed",
        report,
        message: `Cannot promote to ${newStatus}: ${report.blockers.join(", ")} failed`,
      };
    }

    const minScore = getMinQualityScoreForStatus(newStatus);
    if (report.score < minScore) {
      return {
        ok: false,
        code: "quality_score_too_low",
        report,
        required: minScore,
        downgradeTo: getDowngradeStatusForScore(report.score),
        message: `Quality score ${report.score} below minimum ${minScore} for ${newStatus}`,
      };
    }
  }

  const minForTarget = getMinQualityScoreForStatus(newStatus);
  if (report.score < minForTarget && !["resolved", "invalidated", "archived"].includes(newStatus)) {
    return {
      ok: false,
      code: "quality_score_too_low",
      report,
      required: minForTarget,
      downgradeTo: getDowngradeStatusForScore(report.score),
      message: `Quality score ${report.score} below minimum ${minForTarget} for ${newStatus}`,
    };
  }

  const patch: QualityGateOkResult["patch"] = {
    quality_score: report.score,
    quality_checks: qualityChecksToJson(report.checks),
    promotion_blocked_reason: report.blockers.length > 0 ? report.blockers.join(", ") : null,
  };

  if (isThesisStatusPromotion(currentStatus, newStatus)) {
    patch.promoted_at = new Date().toISOString();
  }

  return { ok: true, report, patch };
}

export function qualityGateRowPatchFromReport(
  report: QualityReport,
  opts?: { promotedAt?: string; blockedReason?: string | null },
): Record<string, unknown> {
  return {
    quality_score: report.score,
    quality_checks: qualityChecksToJson(report.checks),
    promotion_blocked_reason:
      opts?.blockedReason !== undefined ? opts.blockedReason : report.blockers.length > 0 ? report.blockers.join(", ") : null,
    ...(opts?.promotedAt ? { promoted_at: opts.promotedAt } : {}),
  };
}
