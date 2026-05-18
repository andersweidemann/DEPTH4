import type { SupabaseClient } from "@supabase/supabase-js";
import { CATALOG_THESES, getThesisDetail } from "@/lib/thesis-engine-v2/catalog-data";
import { catalogResolvedTriplesLookLikeBulkWriterCollapse } from "@/lib/thesis-engine-v2/catalog-scenario-universal-collapse-guard";
import { resolveCatalogThesisScenarioProbabilities } from "@/lib/thesis-engine-v2/catalog-thesis-titles-server";
import {
  applyDbScenarioTripleToThesisWithBundleScenarios,
  dbScenarioTripleEqualsSeed,
} from "@/lib/thesis-engine-v2/thesis-display-scenarios";
import type { Thesis as EngineThesis } from "@/lib/thesis-engine-v2/types";
import type { ThesisOutcomeKind } from "@/types/thesis-outcome";
import type { ThesisLifecycleState, ThesisSurfacedBucket } from "@/types/thesis";
import { THESIS_SURFACED_BUCKETS } from "@/lib/theses/thesis-surfacing-db-constants";
import { parseLifecycleState } from "@/lib/theses/thesis-lifecycle";

/** DB-backed surfacing fields for list merge (Phase 4). */
export type ThesisDbSurfacingPreference = {
  lifecycle_state?: ThesisLifecycleState;
  surfaced_bucket?: ThesisSurfacedBucket | null;
  thesis_score?: number;
  outcome_label?: string | null;
  outcome?: ThesisOutcomeKind | null;
};

function parseSurfacedBucket(v: unknown): ThesisSurfacedBucket | null | undefined {
  if (v == null) return undefined;
  if (typeof v === "string" && (THESIS_SURFACED_BUCKETS as readonly string[]).includes(v)) {
    return v as ThesisSurfacedBucket;
  }
  return undefined;
}

export function buildSurfacingPreferenceFromRow(row: {
  lifecycle_state?: unknown;
  surfaced_bucket?: unknown;
  thesis_score?: unknown;
  outcome_label?: unknown;
  outcome?: unknown;
}): ThesisDbSurfacingPreference {
  const lifecycle_state = parseLifecycleState(row.lifecycle_state);
  const surfaced_bucket = parseSurfacedBucket(row.surfaced_bucket);
  const thesis_score =
    typeof row.thesis_score === "number" && Number.isFinite(row.thesis_score) ? Math.round(row.thesis_score) : undefined;
  const outcome_label =
    typeof row.outcome_label === "string" && row.outcome_label.trim() ? row.outcome_label.trim() : null;
  const out: ThesisDbSurfacingPreference = {};
  if (lifecycle_state != null) out.lifecycle_state = lifecycle_state;
  if (surfaced_bucket !== undefined) out.surfaced_bucket = surfaced_bucket;
  if (thesis_score !== undefined) out.thesis_score = thesis_score;
  if (outcome_label != null) out.outcome_label = outcome_label;
  const outcomeRaw = row.outcome;
  if (
    typeof outcomeRaw === "string" &&
    ["won_clean", "won_messy", "failed", "expired", "withdrawn", "superseded"].includes(outcomeRaw)
  ) {
    out.outcome = outcomeRaw as ThesisOutcomeKind;
  }
  return out;
}

export type LoadCatalogEngineThesesResult = {
  catalogEngine: EngineThesis[];
  discardBulkWriterCollapse: boolean;
  /** DB surfacing keyed by `public.theses.id` for catalog rows (when headers exist). */
  dbSurfacingByThesisId: Map<string, ThesisDbSurfacingPreference>;
};

/**
 * Loads catalog (seeded_system) engine theses merged with DB scenario headers.
 * Shared by `buildThesesListResponse` and the thesis-surfacing cron.
 */
export async function loadCatalogEngineTheses(sb: SupabaseClient): Promise<LoadCatalogEngineThesesResult> {
  const slugs = CATALOG_THESES.map((t) => t.slug);
  const { data: headerRows } = await sb
    .from("theses")
    .select(
      "id, slug, updated_at, scenario_probabilities, lifecycle_state, surfaced_bucket, thesis_score, outcome_label, outcome",
    )
    .in("slug", slugs);

  const catalogHeaderBySlug = new Map<
    string,
    {
      id?: string;
      slug?: string;
      updated_at?: string | null;
      scenario_probabilities?: unknown;
      lifecycle_state?: unknown;
      surfaced_bucket?: unknown;
      thesis_score?: unknown;
      outcome_label?: unknown;
    }
  >();
  const dbSurfacingByThesisId = new Map<string, ThesisDbSurfacingPreference>();
  for (const r of headerRows ?? []) {
    const o = r as {
      id?: string;
      slug?: string;
      updated_at?: string | null;
      scenario_probabilities?: unknown;
      lifecycle_state?: unknown;
      surfaced_bucket?: unknown;
      thesis_score?: unknown;
      outcome_label?: unknown;
    };
    if (typeof o.slug === "string") catalogHeaderBySlug.set(o.slug, o);
    const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : "";
    if (id) dbSurfacingByThesisId.set(id, buildSurfacingPreferenceFromRow(o));
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

  return { catalogEngine, discardBulkWriterCollapse, dbSurfacingByThesisId };
}
