import type { CatalogThesisScenarioProbabilities } from "@/lib/thesis-engine-v2/catalog-thesis-titles-server";
import { mergeDbBodyIntoThesis } from "@/lib/thesis-engine-v2/thesis-db-body";
import {
  dbScenarioTripleEqualsSeed,
  narrativeFallbackScenariosForThesis,
  overlayDbScenarioProbabilities,
  scenarioOverridesFromRows,
} from "@/lib/thesis-engine-v2/thesis-display-scenarios";
import type { Thesis } from "@/lib/thesis-engine-v2/types";

export type UserThesisServerCatalog = {
  title: string | null;
  microLabel: string | null;
  body: unknown | null;
  scenarioProbabilities: CatalogThesisScenarioProbabilities | null;
};

/**
 * Merge Supabase-fed header fields onto a locally stored user thesis.
 * Same contract as catalog detail: skip overlay when DB still holds the shared seed triple.
 */
export function mergeUserThesisWithServerCatalog(local: Thesis, catalog: UserThesisServerCatalog): Thesis {
  let t = local;
  const title = (catalog.title ?? "").trim();
  const micro = (catalog.microLabel ?? "").trim();
  if (title) t = { ...t, title };
  if (micro) t = { ...t, microLabel: micro };
  t = mergeDbBodyIntoThesis(t, catalog.body ?? null);

  const rows = narrativeFallbackScenariosForThesis(t);
  let seeded = scenarioOverridesFromRows(rows);
  const p = catalog.scenarioProbabilities;
  if (p && !dbScenarioTripleEqualsSeed(p)) {
    seeded = overlayDbScenarioProbabilities(seeded, p);
  }
  return { ...t, scenarioOverrides: seeded };
}
