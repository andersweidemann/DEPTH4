/**
 * Feature flags for thesis scenario probabilities driven by evidence scoring.
 *
 * When enabled, `ThesisDetailClient` may replace template triples with
 * **provisional** probabilities from `scenario-evidence-model.ts` if the
 * snapshot has enough signal and the mapped triple is not a known template.
 *
 * Set in `.env.local` / deployment:
 *   NEXT_PUBLIC_DEPTH4_LIVE_SCENARIO_PROBS=1
 */
export function liveScenarioProbabilitiesForThesesEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DEPTH4_LIVE_SCENARIO_PROBS === "1";
}
