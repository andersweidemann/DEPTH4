import { shouldWriteScenarioProbabilitiesColumnFromNewsCron } from "@/lib/thesis-engine-v2/thesis-scenario-column-writers";

/** Modeled path shift from `computeSuggestedUpdate` in thesis-news cron. */
export type ThesisNewsScenarioSuggestion = {
  bump: number;
  next: { base: number; bull: number; bear: number };
};

/**
 * thesis-news **writer** policy (post **2b642e4**). Full cross-origin policy: {@link shouldWriteScenarioProbabilitiesColumnFromNewsCron} module doc.
 *
 * - **Evidence insert:** only when `suggestion != null` (modeled triple). No `NEWS_DEVELOPMENT` rows with
 *   `probability_after = null` from “match but no model” paths.
 * - **`theses.scenario_probabilities` update:** only when {@link shouldRunThesisNewsThesesTableScenarioUpdate} is true
 *   — i.e. `shouldApply && suggestion` **and** origin is **not** `seeded_system`.
 */
export function shouldInsertThesisNewsEvidenceLogRow(suggestion: ThesisNewsScenarioSuggestion | null): boolean {
  return suggestion != null;
}

export function shouldRunThesisNewsThesesTableScenarioUpdate(args: {
  thesisOrigin: string | null | undefined;
  shouldApply: boolean;
  suggestion: ThesisNewsScenarioSuggestion | null;
}): boolean {
  return (
    args.shouldApply &&
    args.suggestion != null &&
    shouldWriteScenarioProbabilitiesColumnFromNewsCron(args.thesisOrigin)
  );
}

/** Phase 3A: weak tag/ticker match logged without scenario movement (`probability_after` = prior). */
export function shouldInsertMechanismWeakEvidenceLogRow(args: {
  logOnly: boolean;
  allowed: boolean;
}): boolean {
  return args.logOnly && !args.allowed;
}
