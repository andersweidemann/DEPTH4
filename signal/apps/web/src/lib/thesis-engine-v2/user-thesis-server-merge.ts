import type { CatalogThesisScenarioProbabilities } from "@/lib/thesis-engine-v2/catalog-thesis-titles-server";
import { mergeDbBodyIntoThesis } from "@/lib/thesis-engine-v2/thesis-db-body";
import {
  dbScenarioTripleEqualsSeed,
  narrativeFallbackScenariosForThesis,
  overlayDbScenarioProbabilities,
  scenarioOverridesFromRows,
  thesisWithSyncedLiveProbability,
} from "@/lib/thesis-engine-v2/thesis-display-scenarios";
import type { Thesis } from "@/lib/thesis-engine-v2/types";

export type UserThesisServerCatalog = {
  title: string | null;
  microLabel: string | null;
  body: unknown | null;
  scenarioProbabilities: CatalogThesisScenarioProbabilities | null;
};

export type MergeUserThesisWithServerCatalogOptions = {
  /**
   * When true (Supabase row rebuild / catalog list header), always apply `scenario_probabilities` from DB,
   * including the shared seed triple `{base:40,bull:35,bear:25}` — that triple is still the row’s source of truth.
   * When false/omitted (client merge after local edits), skip overlaying the seed so a divergent draft is not
   * clobbered by the placeholder until cron/evidence writes a divergent triple.
   */
  forceApplyDbProbabilities?: boolean;
};

/**
 * Merge Supabase-fed header fields onto a locally stored user thesis.
 * By default, skip overlay when DB still holds the shared seed triple `{base:40,bull:35,bear:25}` so a
 * divergent client triple is not overwritten with that placeholder (`ThesisDetailClient` polling).
 * Use `forceApplyDbProbabilities: true` when rebuilding from `public.theses` (`userThesisFromSupabaseRow`).
 */
export function mergeUserThesisWithServerCatalog(
  local: Thesis,
  catalog: UserThesisServerCatalog,
  options?: MergeUserThesisWithServerCatalogOptions,
): Thesis {
  let t = local;
  const title = (catalog.title ?? "").trim();
  const micro = (catalog.microLabel ?? "").trim();
  if (title) t = { ...t, title };
  if (micro) t = { ...t, microLabel: micro };
  t = mergeDbBodyIntoThesis(t, catalog.body ?? null);

  const rows = narrativeFallbackScenariosForThesis(t);
  let seeded = scenarioOverridesFromRows(rows);
  const p = catalog.scenarioProbabilities;
  const applyOverlay = p && (options?.forceApplyDbProbabilities === true || !dbScenarioTripleEqualsSeed(p));
  if (applyOverlay) {
    seeded = overlayDbScenarioProbabilities(seeded, p);
  }
  return thesisWithSyncedLiveProbability({ ...t, scenarioOverrides: seeded });
}
