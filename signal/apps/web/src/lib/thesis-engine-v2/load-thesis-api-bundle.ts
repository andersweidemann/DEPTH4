import type { SupabaseClient } from "@supabase/supabase-js";
import type { CatalogThesisScenarioProbabilities } from "@/lib/thesis-engine-v2/catalog-thesis-titles-server";
import { fetchCatalogThesisHeaderBySlug, parseScenarioProbabilities } from "@/lib/thesis-engine-v2/catalog-thesis-titles-server";
import { getThesisDetail } from "@/lib/thesis-engine-v2/catalog-data";
import { mergeDbBodyIntoThesis } from "@/lib/thesis-engine-v2/thesis-db-body";
import { overlayDbScenarioProbabilities, scenarioOverridesFromRows, thesisWithSyncedLiveProbability } from "@/lib/thesis-engine-v2/thesis-display-scenarios";
import type { ThesisDetailBundle } from "@/lib/thesis-engine-v2/types";
import { bundleForUserThesis } from "@/lib/thesis-engine-v2/user-theses";
import { userThesisFromSupabaseRow } from "@/lib/thesis-engine-v2/user-thesis-from-db-row";

function withCatalogHeader(
  bundle: ThesisDetailBundle,
  catalog: {
    title?: string | null;
    microLabel?: string | null;
    body?: unknown | null;
    scenarioProbabilities?: CatalogThesisScenarioProbabilities | null;
  },
): ThesisDetailBundle {
  const t = (catalog.title ?? "").trim();
  const m = (catalog.microLabel ?? "").trim();
  const hasBody = catalog.body !== undefined && catalog.body !== null;
  const hasDbP = catalog.scenarioProbabilities != null;
  if (!t && !m && !hasBody && !hasDbP) return bundle;
  let thesis = bundle.thesis;
  if (t) thesis = { ...thesis, title: t };
  if (m) thesis = { ...thesis, microLabel: m };
  thesis = mergeDbBodyIntoThesis(thesis, catalog.body ?? null);

  let seeded = scenarioOverridesFromRows(bundle.scenarios);
  if (catalog.scenarioProbabilities) {
    seeded = overlayDbScenarioProbabilities(seeded, catalog.scenarioProbabilities);
  }
  thesis = thesisWithSyncedLiveProbability({ ...thesis, scenarioOverrides: seeded });

  const scenarioProbabilitiesFromDb =
    bundle.scenarioProbabilitiesFromDb === true || catalog.scenarioProbabilities != null;

  return { ...bundle, thesis, scenarioProbabilitiesFromDb };
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
    });
    return { ...b, thesis: thesisWithSyncedLiveProbability(b.thesis) };
  }

  const { data: aiRow, error: aiErr } = await supabase
    .from("theses")
    .select("id, slug, title, micro_label, body, scenario_probabilities, status, insider_flow, updated_at, thesis_origin")
    .eq("slug", slug)
    .eq("thesis_origin", "ai_generated")
    .maybeSingle();

  if (!aiErr && aiRow) {
    const thesis = userThesisFromSupabaseRow(aiRow as Parameters<typeof userThesisFromSupabaseRow>[0]);
    const parsed = parseScenarioProbabilities(
      (aiRow as { scenario_probabilities?: unknown }).scenario_probabilities,
    );
    return bundleForUserThesis(thesis, { scenarioProbabilitiesFromDb: parsed != null });
  }

  if (!userId) return null;

  const { data, error } = await supabase
    .from("theses")
    .select("id, slug, title, micro_label, body, scenario_probabilities, status, insider_flow, updated_at, thesis_origin")
    .eq("slug", slug)
    .eq("owner_user_id", userId)
    .eq("thesis_origin", "user")
    .maybeSingle();

  if (error || !data) return null;
  const thesis = userThesisFromSupabaseRow(
    data as Parameters<typeof userThesisFromSupabaseRow>[0],
  );
  const parsed = parseScenarioProbabilities(
    (data as { scenario_probabilities?: unknown }).scenario_probabilities,
  );
  return bundleForUserThesis(thesis, { scenarioProbabilitiesFromDb: parsed != null });
}
