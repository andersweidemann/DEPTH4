import { getThesisDetail } from "@/lib/thesis-engine-v2/catalog-data";
import { mergeDbBodyIntoThesis } from "@/lib/thesis-engine-v2/thesis-db-body";
import { loadThesisDetailBundleForApi } from "@/lib/thesis-engine-v2/load-thesis-api-bundle";
import { overlayDbScenarioProbabilities, scenarioOverridesFromRows, thesisWithSyncedLiveProbability } from "@/lib/thesis-engine-v2/thesis-display-scenarios";
import { parseScenarioProbabilities } from "@/lib/thesis-engine-v2/catalog-thesis-titles-server";
import type { ThesisDetailBundle } from "@/lib/thesis-engine-v2/types";
import { bundleForUserThesis } from "@/lib/thesis-engine-v2/user-theses";
import { userThesisFromSupabaseRow } from "@/lib/thesis-engine-v2/user-thesis-from-db-row";
import { createServiceRoleClient } from "@/lib/supabase/service-role-client";

export type ThesisReaderPublicRow = {
  id: string;
  slug: string | null;
  reader_public_enabled: boolean;
  owner_user_id: string | null;
  thesis_origin: string | null;
};

export function isThesisReaderSharePath(pathname: string): boolean {
  const p = pathname.split("?")[0] ?? pathname;
  return /^\/theses\/[^/]+\/read(?:\/opengraph-image)?\/?$/.test(p);
}

export async function fetchThesisReaderPublicRow(slug: string): Promise<ThesisReaderPublicRow | null> {
  const s = slug.trim();
  if (!s) return null;
  const svc = createServiceRoleClient();
  if (!svc) return null;

  const { data, error } = await svc
    .from("theses")
    .select("id, slug, reader_public_enabled, owner_user_id, thesis_origin")
    .eq("slug", s)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id : "";
  if (!id) return null;
  return {
    id,
    slug: typeof row.slug === "string" ? row.slug : null,
    reader_public_enabled: row.reader_public_enabled === true,
    owner_user_id: typeof row.owner_user_id === "string" ? row.owner_user_id : null,
    thesis_origin: typeof row.thesis_origin === "string" ? row.thesis_origin : null,
  };
}

export async function isThesisReaderPublic(slug: string): Promise<boolean> {
  const row = await fetchThesisReaderPublicRow(slug);
  return row?.reader_public_enabled === true;
}

/** Authenticated user may toggle public reader for this slug. */
export function canManageThesisReaderPublic(
  row: ThesisReaderPublicRow,
  userId: string,
): boolean {
  if (row.owner_user_id) return row.owner_user_id === userId;
  return getThesisDetail(slugFromRow(row)) != null;
}

function slugFromRow(row: ThesisReaderPublicRow): string {
  return (row.slug ?? "").trim();
}

export async function setThesisReaderPublic(slug: string, enabled: boolean, userId: string): Promise<boolean> {
  let row = await fetchThesisReaderPublicRow(slug);
  if (!row) row = await ensureThesisRowForCatalogSlug(slug);
  if (!row || !canManageThesisReaderPublic(row, userId)) return false;

  const svc = createServiceRoleClient();
  if (!svc) return false;

  const { error } = await svc
    .from("theses")
    .update({ reader_public_enabled: enabled, updated_at: new Date().toISOString() })
    .eq("id", row.id);

  return !error;
}

/**
 * Read-only bundle for anonymous reader when `reader_public_enabled` is true.
 * Service-role load — never exposed to client except rendered reader fields.
 */
export async function loadPublicThesisReaderBundle(slug: string): Promise<ThesisDetailBundle | null> {
  if (!(await isThesisReaderPublic(slug))) return null;

  const svc = createServiceRoleClient();
  if (!svc) return null;

  const catalog = getThesisDetail(slug);
  if (catalog) {
    return loadThesisDetailBundleForApi(svc, slug, null);
  }

  const { data, error } = await svc
    .from("theses")
    .select(
      "id, slug, title, micro_label, body, scenario_probabilities, status, insider_flow, updated_at, thesis_origin, reader_public_enabled",
    )
    .eq("slug", slug)
    .eq("reader_public_enabled", true)
    .maybeSingle();

  if (error || !data) return null;

  const thesis = userThesisFromSupabaseRow(data as Parameters<typeof userThesisFromSupabaseRow>[0]);
  const parsed = parseScenarioProbabilities(
    (data as { scenario_probabilities?: unknown }).scenario_probabilities,
  );
  let bundle = bundleForUserThesis(thesis, { scenarioProbabilitiesFromDb: parsed != null });

  const body = (data as { body?: unknown }).body;
  if (body != null) {
    const merged = mergeDbBodyIntoThesis(bundle.thesis, body);
    bundle = { ...bundle, thesis: merged };
  }

  let seeded = scenarioOverridesFromRows(bundle.scenarios);
  if (parsed) seeded = overlayDbScenarioProbabilities(seeded, parsed);
  bundle = {
    ...bundle,
    thesis: thesisWithSyncedLiveProbability({ ...bundle.thesis, scenarioOverrides: seeded }),
    scenarioProbabilitiesFromDb: parsed != null,
  };

  return bundle;
}

/** Ensure a catalog thesis has a DB row before toggling public share. */
export async function ensureThesisRowForCatalogSlug(slug: string): Promise<ThesisReaderPublicRow | null> {
  const existing = await fetchThesisReaderPublicRow(slug);
  if (existing) return existing;

  const catalog = getThesisDetail(slug);
  if (!catalog) return null;

  const svc = createServiceRoleClient();
  if (!svc) return null;

  const t = catalog.thesis;
  const { data, error } = await svc
    .from("theses")
    .upsert(
      {
        id: t.id,
        slug,
        title: t.title,
        status: t.status,
        thesis_origin: "seeded_system",
        reader_public_enabled: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    )
    .select("id, slug, reader_public_enabled, owner_user_id, thesis_origin")
    .single();

  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  return {
    id: String(row.id),
    slug: typeof row.slug === "string" ? row.slug : slug,
    reader_public_enabled: row.reader_public_enabled === true,
    owner_user_id: null,
    thesis_origin: "seeded_system",
  };
}
