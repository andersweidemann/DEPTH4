import { generateIncentiveAnalysisForDb } from "@/lib/thesis/incentive-analysis-generator";
import { incentiveAnalysisToDbJson, parseIncentiveAnalysis } from "@/lib/thesis/incentive-analysis";
import type { Thesis } from "@/lib/thesis-engine-v2/types";

/** Resolve `incentive_analysis` JSON for insert/update. Preserves existing DB row unless thesis carries a new value. */
export async function resolveIncentiveAnalysisColumn(
  thesis: Thesis,
  existingDbValue: unknown,
  isNewRow: boolean,
): Promise<Record<string, unknown> | null | undefined> {
  if (thesis.incentiveAnalysis) {
    return incentiveAnalysisToDbJson(thesis.incentiveAnalysis);
  }
  const existing = parseIncentiveAnalysis(existingDbValue);
  if (existing) {
    return incentiveAnalysisToDbJson(existing);
  }
  if (!isNewRow) return undefined;
  return await generateIncentiveAnalysisForDb(thesis);
}
