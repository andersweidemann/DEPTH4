/**
 * ## `public.theses.scenario_probabilities` automation policy (post **2b642e4**)
 *
 * ### `seeded_system` (shipped catalog theses)
 *
 * - **thesis-news cron** (`/api/cron/thesis-news`): may insert `thesis_evidence_log` **only** when
 *   `computeSuggestedUpdate` returns a **non-null** modeled triple (`NEWS_DEVELOPMENT` with real `probability_after`).
 *   Matched news with **no** model does **not** insert a row — avoids newest-first NULL rows shadowing older evidence.
 * - **thesis-news cron** does **not** update `theses.scenario_probabilities` for `seeded_system`, even when
 *   `THESIS_NEWS_AUTO_APPLY=1` and the delta threshold passes — avoids one identical triple being stamped onto every
 *   catalog row that still shared the seed prior.
 * - **Macro event reasoning** (`persistEventReasoningToThesisState`): always inserts `thesis_evidence_log` with a
 *   real triple when promotion succeeds; **skips** the `theses` column update for `seeded_system` using the same
 *   {@link shouldWriteScenarioProbabilitiesColumnFromNewsCron} guard (re-used name: “news cron” historically).
 *
 * ### `user` / `ai_generated` / legacy (non-`seeded_system`)
 *
 * - thesis-news: same evidence insert rules as catalog (modeled suggestion only).
 * - thesis-news: **does** update `theses.scenario_probabilities` when auto-apply + threshold + modeled suggestion.
 * - Macro persist: **does** update the column after evidence insert when origin is not `seeded_system`.
 *
 * ### Reads
 *
 * Catalog slug/list resolution prefers a **non-seed** column triple, else the latest **non-seed** evidence triple;
 * see {@link mergeCatalogDbScenarioColumnWithEvidenceFallback} and {@link pickLatestNonSeedEvidenceTripleFromDescendingRows}
 * in `catalog-thesis-titles-server.ts`.
 */
export function shouldWriteScenarioProbabilitiesColumnFromNewsCron(thesisOrigin: string | null | undefined): boolean {
  return (thesisOrigin || "").trim() !== "seeded_system";
}
