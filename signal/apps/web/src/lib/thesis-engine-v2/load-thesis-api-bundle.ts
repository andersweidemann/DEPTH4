import type { SupabaseClient } from "@supabase/supabase-js";
import type { CatalogThesisScenarioProbabilities } from "@/lib/thesis-engine-v2/catalog-thesis-titles-server";
import type { IncentiveAnalysis } from "@/types/incentive-analysis";
import { fetchCatalogThesisHeaderBySlug, parseScenarioProbabilities } from "@/lib/thesis-engine-v2/catalog-thesis-titles-server";
import { getThesisDetail } from "@/lib/thesis-engine-v2/catalog-data";
import { mergeDbBodyIntoThesis } from "@/lib/thesis-engine-v2/thesis-db-body";
import { overlayDbScenarioProbabilities, scenarioOverridesFromRows, thesisWithSyncedLiveProbability } from "@/lib/thesis-engine-v2/thesis-display-scenarios";
import type { ThesisDetailBundle } from "@/lib/thesis-engine-v2/types";
import { fetchThesisRowBySlug } from "@/lib/thesis-engine-v2/fetch-thesis-row-by-slug";
import { thesisEvidenceFromBodyJson } from "@/lib/thesis-engine-v2/body-evidence-to-thesis-evidence";
import { bundleForUserThesis } from "@/lib/thesis-engine-v2/user-theses";
import { userThesisFromSupabaseRow } from "@/lib/thesis-engine-v2/user-thesis-from-db-row";

function withCatalogHeader(
  bundle: ThesisDetailBundle,
  catalog: {
    title?: string | null;
    microLabel?: string | null;
    body?: unknown | null;
    scenarioProbabilities?: CatalogThesisScenarioProbabilities | null;
    incentiveAnalysis?: IncentiveAnalysis | null;
  },
): ThesisDetailBundle {
  const t = (catalog.title ?? "").trim();
  const m = (catalog.microLabel ?? "").trim();
  const hasBody = catalog.body !== undefined && catalog.body !== null;
  const hasDbP = catalog.scenarioProbabilities != null;
  const hasIncentive = catalog.incentiveAnalysis != null;
  if (!t && !m && !hasBody && !hasDbP && !hasIncentive) return bundle;
  let thesis = bundle.thesis;
  if (t) thesis = { ...thesis, title: t };
  if (m) thesis = { ...thesis, microLabel: m };
  thesis = mergeDbBodyIntoThesis(thesis, catalog.body ?? null);
  if (catalog.incentiveAnalysis) thesis = { ...thesis, incentiveAnalysis: catalog.incentiveAnalysis };

  let seeded = scenarioOverridesFromRows(bundle.scenarios);
  if (catalog.scenarioProbabilities) {
    seeded = overlayDbScenarioProbabilities(seeded, catalog.scenarioProbabilities);
  }
  thesis = thesisWithSyncedLiveProbability({ ...thesis, scenarioOverrides: seeded });

  const scenarioProbabilitiesFromDb =
    bundle.scenarioProbabilitiesFromDb === true || catalog.scenarioProbabilities != null;

  const bodyEvidence =
    catalog.body != null ? thesisEvidenceFromBodyJson(catalog.body, thesis.id) : [];
  const evidence = bodyEvidence.length > 0 ? bodyEvidence : bundle.evidence;

  return { ...bundle, thesis, evidence, scenarioProbabilitiesFromDb };
}

/**
 * Catalog thesis (shipped bundle + Supabase header) or the signed-in user’s thesis row for `slug`.
 */
export async function loadThesisDetailBundleForApi(
  supabase: SupabaseClient,
  slug: string,
  userId: string | null,
): Promise<ThesisDetailBundle | null> {
  const header = await fetchCatalogThesisHeaderBySlug(supabase, slug);
  const sys = getThesisDetail(slug);
  if (sys) {
    const b = withCatalogHeader(sys, {
      title: header.title,
      microLabel: header.microLabel,
      body: header.body,
      scenarioProbabilities: header.scenarioProbabilities ?? null,
      incentiveAnalysis: header.incentiveAnalysis ?? null,
    });
    return { ...b, thesis: thesisWithSyncedLiveProbability(b.thesis) };
  }

  const dbRow = await fetchThesisRowBySlug(supabase, slug, userId);
  if (!dbRow) return null;

  const thesis = userThesisFromSupabaseRow(
    dbRow as Parameters<typeof userThesisFromSupabaseRow>[0],
  );
  const parsed = parseScenarioProbabilities(dbRow.scenario_probabilities);
  return bundleForUserThesis(thesis, {
    scenarioProbabilitiesFromDb: parsed != null,
    body: dbRow.body,
  });
}
