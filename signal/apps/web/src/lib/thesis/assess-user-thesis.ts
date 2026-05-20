import type { SupabaseClient } from "@supabase/supabase-js";
import { getDailyBars } from "@/lib/market-data";
import { readEvidenceFromBody } from "@/lib/ai/thesis-pipeline-body";
import {
  qualityGateInputFromEngineThesis,
  qualityChecksToJson,
  runQualityGate,
} from "@/lib/thesis/quality-gate";
import { userThesisFromSupabaseRow } from "@/lib/thesis-engine-v2/user-thesis-from-db-row";
import { mergeDbBodyIntoThesis, thesisToDbBodyPayload } from "@/lib/thesis-engine-v2/thesis-db-body";
import { computeLiveTradePlan, mapAssetToQuoteSymbol } from "@/lib/thesis-engine-v2/live-trade-plan";
import { qualificationFromTotal } from "@/lib/thesis-engine-v2/thesis-merge";
import {
  meetsUserThesisPromotionThresholds,
  mispricingPctFromThesis,
  UNCALIBRATED_SCENARIO_DB,
  userCalibrationToBodyPatch,
  type UserThesisCalibration,
} from "@/lib/thesis/user-thesis-lifecycle";
import { normalizeScenarioTriple } from "@/lib/thesis/remodel-scenarios";

export type AssessUserThesisResult = {
  promoted: boolean;
  calibration: UserThesisCalibration;
  status: "watching" | "ready";
  qualityScore: number;
};

function stripTradePlanFromBody(body: Record<string, unknown>): Record<string, unknown> {
  const next = { ...body };
  delete next.trade_plan;
  delete next.entry_zone;
  delete next.stop;
  delete next.target1;
  delete next.target2;
  return next;
}

function buildQualityInputFromRow(row: {
  slug: string;
  title: string;
  body?: unknown;
  scenario_probabilities?: unknown;
}): ReturnType<typeof qualityGateInputFromEngineThesis> {
  const shell = userThesisFromSupabaseRow({
    id: "assess",
    slug: row.slug,
    title: row.title,
    body: row.body,
    scenario_probabilities: row.scenario_probabilities,
    status: "watching",
  });
  const bodyObj =
    row.body && typeof row.body === "object" && !Array.isArray(row.body)
      ? (row.body as Record<string, unknown>)
      : {};
  const evidence = readEvidenceFromBody(bodyObj);
  const tp = bodyObj.trade_plan as Record<string, unknown> | undefined;
  const input = qualityGateInputFromEngineThesis(shell);
  return {
    ...input,
    bodyEvidence: evidence,
    bodyTradePlan: tp
      ? {
          entry_zone: String(tp.entry_zone ?? ""),
          stop: String(tp.stop ?? ""),
          target1: String(tp.target1 ?? ""),
        }
      : null,
    bodyResolutionPaths: undefined,
  };
}

/**
 * After populate (or manual retry): score thesis, promote to `ready` when edge exists, else stay `watching`.
 */
export async function assessUserThesis(
  supabase: SupabaseClient,
  thesisId: string,
): Promise<AssessUserThesisResult | null> {
  const { data: row, error } = await supabase
    .from("theses")
    .select("id, slug, title, status, body, scenario_probabilities, thesis_origin")
    .eq("id", thesisId)
    .maybeSingle();

  if (error || !row || row.thesis_origin !== "user") return null;

  const report = runQualityGate(buildQualityInputFromRow(row), null, []);
  const engine = userThesisFromSupabaseRow({
    id: row.id,
    slug: row.slug,
    title: row.title,
    body: row.body,
    scenario_probabilities: row.scenario_probabilities,
    status: row.status,
    thesis_origin: "user",
    quality_score: report.score,
  });

  const mispricingPct = mispricingPctFromThesis(engine);
  const evidenceCount = readEvidenceFromBody(
    row.body && typeof row.body === "object" ? (row.body as Record<string, unknown>) : {},
  ).length;
  const hasEvidence = evidenceCount >= 1;
  const promoted =
    meetsUserThesisPromotionThresholds(report.score, mispricingPct) &&
    hasEvidence &&
    report.blockers.filter((b) => b !== "trade_plan_complete" && b !== "conviction_calibrated").length === 0;

  const nowIso = new Date().toISOString();
  const priorBody =
    row.body && typeof row.body === "object" && !Array.isArray(row.body)
      ? ({ ...(row.body as Record<string, unknown>) } as Record<string, unknown>)
      : {};

  if (promoted) {
    let thesis = mergeDbBodyIntoThesis(engine, priorBody);
    const quote = mapAssetToQuoteSymbol(thesis.asset);
    if (quote && thesis.direction !== "watch") {
      const bars = await getDailyBars(quote);
      const live = computeLiveTradePlan({
        bars,
        direction: thesis.direction,
        status: "ready",
        quoteSymbol: quote,
        convictionPct: Math.round((thesis.scenarioOverrides?.base.probability ?? 0) + (thesis.scenarioOverrides?.bull.probability ?? 0)),
      });
      if (live.trade_plan.ready) {
        thesis = {
          ...thesis,
          entryZone: live.trade_plan.entry_zone.mid != null ? String(live.trade_plan.entry_zone.mid) : thesis.entryZone,
          stop: live.trade_plan.stop != null ? String(live.trade_plan.stop) : thesis.stop,
          target1: live.trade_plan.target1 != null ? String(live.trade_plan.target1) : thesis.target1,
          target2: live.trade_plan.target2 != null ? String(live.trade_plan.target2) : thesis.target2,
        };
      }
    }

    const total = thesis.scores?.total ?? report.score;
    thesis = {
      ...thesis,
      status: "ready",
      qualification: qualificationFromTotal(total >= 65 ? total : Math.max(total, 66)),
      qualityScore: report.score,
      userCalibration: {
        phase: "tradeable",
        assessed_at: nowIso,
        quality_score: report.score,
        mispricing_pct: mispricingPct,
        summary: `Promoted to tradeable — edge ${mispricingPct}% · quality ${report.score}/100.`,
      },
    };

    const scenarioRaw = row.scenario_probabilities as { base?: number; bull?: number; bear?: number } | null;
    const scenario_probabilities = scenarioRaw
      ? normalizeScenarioTriple({
          clean: Number(scenarioRaw.bull ?? 35),
          messy: Number(scenarioRaw.base ?? 40),
          broken: Number(scenarioRaw.bear ?? 25),
        })
      : normalizeScenarioTriple({ clean: 30, messy: 50, broken: 20 });

    const mergedBody = {
      ...priorBody,
      ...thesisToDbBodyPayload(thesis),
      ...userCalibrationToBodyPatch(thesis.userCalibration!),
    };

    await supabase
      .from("theses")
      .update({
        status: "ready",
        body: mergedBody,
        scenario_probabilities: {
          base: scenario_probabilities.messy,
          bull: scenario_probabilities.clean,
          bear: scenario_probabilities.broken,
        },
        quality_score: report.score,
        quality_checks: qualityChecksToJson(report.checks),
        promotion_blocked_reason: null,
        promoted_at: nowIso,
        updated_at: nowIso,
        last_meaningful_update_at: nowIso,
      })
      .eq("id", thesisId);

    return {
      promoted: true,
      calibration: thesis.userCalibration!,
      status: "ready",
      qualityScore: report.score,
    };
  }

  const calibration: UserThesisCalibration = {
    phase: "watching_no_edge",
    assessed_at: nowIso,
    quality_score: report.score,
    mispricing_pct: mispricingPct,
    summary:
      report.blockers.length > 0
        ? `No clear edge yet (${report.blockers.slice(0, 3).join(", ")}). DEPTH4 will keep monitoring.`
        : "No clear edge detected yet — market may already price this scenario. DEPTH4 will keep monitoring.",
  };

  const stripped = stripTradePlanFromBody(priorBody);
  const mergedBody = { ...stripped, ...userCalibrationToBodyPatch(calibration) };

  await supabase
    .from("theses")
    .update({
      status: "watching",
      body: mergedBody,
      scenario_probabilities: UNCALIBRATED_SCENARIO_DB,
      quality_score: report.score,
      quality_checks: qualityChecksToJson(report.checks),
      promotion_blocked_reason: report.blockers.join(", ") || "no_edge",
      updated_at: nowIso,
    })
    .eq("id", thesisId);

  return {
    promoted: false,
    calibration,
    status: "watching",
    qualityScore: report.score,
  };
}
