import type { SupabaseClient } from "@supabase/supabase-js";
import { CATALOG_THESES, getThesisDetail } from "@/lib/thesis-engine-v2/catalog-data";
import { catalogResolvedTriplesLookLikeBulkWriterCollapse } from "@/lib/thesis-engine-v2/catalog-scenario-universal-collapse-guard";
import { resolveCatalogThesisScenarioProbabilities } from "@/lib/thesis-engine-v2/catalog-thesis-titles-server";
import {
  applyDbScenarioTripleToThesisWithBundleScenarios,
  dbScenarioTripleEqualsSeed,
} from "@/lib/thesis-engine-v2/thesis-display-scenarios";
import type { Thesis as EngineThesis } from "@/lib/thesis-engine-v2/types";

export type LoadCatalogEngineThesesResult = {
  catalogEngine: EngineThesis[];
  discardBulkWriterCollapse: boolean;
};

/**
 * Loads catalog (seeded_system) engine theses merged with DB scenario headers.
 * Shared by `buildThesesListResponse` and the thesis-surfacing cron.
 */
export async function loadCatalogEngineTheses(sb: SupabaseClient): Promise<LoadCatalogEngineThesesResult> {
  const slugs = CATALOG_THESES.map((t) => t.slug);
  const { data: headerRows } = await sb
    .from("theses")
    .select("id, slug, updated_at, scenario_probabilities")
    .in("slug", slugs);

  const catalogHeaderBySlug = new Map<
    string,
    { id?: string; slug?: string; updated_at?: string | null; scenario_probabilities?: unknown }
  >();
  for (const r of headerRows ?? []) {
    const o = r as { id?: string; slug?: string; updated_at?: string | null; scenario_probabilities?: unknown };
    if (typeof o.slug === "string") catalogHeaderBySlug.set(o.slug, o);
  }

  const catalogRows = await Promise.all(
    CATALOG_THESES.map(async (t) => {
      const detail = getThesisDetail(t.slug);
      if (!detail) return null;
      const hdr = catalogHeaderBySlug.get(t.slug);
      const thesisId = typeof hdr?.id === "string" && hdr.id.trim() ? hdr.id.trim() : t.id;
      const resolved = await resolveCatalogThesisScenarioProbabilities(sb, thesisId, hdr?.scenario_probabilities);
      return { detail, hdr, resolved };
    }),
  );

  const resolvedForGuard = catalogRows.map((row) => row?.resolved ?? null);
  const discardBulkWriterCollapse = catalogResolvedTriplesLookLikeBulkWriterCollapse(resolvedForGuard);

  const catalogParts = catalogRows.map((row) => {
    if (!row) return null;
    const { detail, hdr, resolved } = row;
    const iso = hdr?.updated_at?.trim() ? hdr.updated_at : null;
    let thesis = detail.thesis;
    const effective = discardBulkWriterCollapse ? null : resolved;
    if (effective && !dbScenarioTripleEqualsSeed(effective)) {
      thesis = applyDbScenarioTripleToThesisWithBundleScenarios(thesis, detail.scenarios, effective);
    }
    return { ...thesis, lastUpdated: iso ? iso : thesis.lastUpdated };
  });
  const catalogEngine: EngineThesis[] = catalogParts.filter((x): x is EngineThesis => x != null);

  return { catalogEngine, discardBulkWriterCollapse };
}
