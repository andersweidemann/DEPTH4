/** Public exports for thesis re-modeling (evidence cascade + manual API). */
export {
  cleanMessyBrokenToTriple,
  nearLevelPct,
  normalizeScenarioTriple,
  remodelThesisScenarios,
  thesisNeedsTradePlanRemodel,
  tripleToCleanMessyBroken,
  type RemodelResult,
  type RemodelScenarios,
  type RemodelThesisOptions,
  type RemodelTradePlan,
} from "@/lib/thesis/remodel-scenarios";
export {
  generateWhatChangedFallback,
  pickWhatChangedSummary,
} from "@/lib/thesis/generate-what-changed";
