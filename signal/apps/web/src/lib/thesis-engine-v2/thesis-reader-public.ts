import { getThesisDetail } from "@/lib/thesis-engine-v2/catalog-data";
import {
  canManageThesisReaderPublic,
  type ThesisReaderPublishingContext,
} from "@/lib/thesis-engine-v2/thesis-reader-publishing-access";
import { mergeDbBodyIntoThesis } from "@/lib/thesis-engine-v2/thesis-db-body";
import { SupabaseThesisUpdateRepository } from "@/lib/thesis-mutation/repositories/supabase-thesis-update-repository";
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

/** Public analytics beacon — validates thesis is public in the route handler. */
export function isPublicReaderViewApiPath(pathname: string): boolean {
  const p = pathname.split("?")[0] ?? pathname;
  return /^\/api\/theses\/[^/]+\/reader-view\/?$/.test(p);
}

export function parseThesisReaderPublicRow(data: unknown): ThesisReaderPublicRow | null {
  if (!data || typeof data !== "object") return null;
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

/**
 * When multiple rows share a slug, prefer `reader_public_enabled` then newest `updated_at`.
 * Used in tests; production fetch uses the same ordering in SQL + `limit(1)`.
 */
export function pickThesisReaderPublicRowFromDbRows(rows: unknown[]): ThesisReaderPublicRow | null {
  const ranked = rows
    .map((raw) => ({
      raw: raw as Record<string, unknown>,
      parsed: parseThesisReaderPublicRow(raw),
    }))
    .filter((x): x is { raw: Record<string, unknown>; parsed: ThesisReaderPublicRow } => x.parsed != null)
    .sort((a, b) => {
      const pubA = a.parsed.reader_public_enabled ? 1 : 0;
      const pubB = b.parsed.reader_public_enabled ? 1 : 0;
      if (pubB !== pubA) return pubB - pubA;
      const ta = typeof a.raw.updated_at === "string" ? Date.parse(a.raw.updated_at) : 0;
      const tb = typeof b.raw.updated_at === "string" ? Date.parse(b.raw.updated_at) : 0;
      return tb - ta;
    });
  return ranked[0]?.parsed ?? null;
}

export async function fetchThesisReaderPublicRow(slug: string): Promise<ThesisReaderPublicRow | null> {
  const s = slug.trim();
  if (!s) return null;
  const svc = createServiceRoleClient();
  if (!svc) return null;

  const { data, error } = await svc
    .from("theses")
    .select("id, slug, reader_public_enabled, owner_user_id, thesis_origin, updated_at")
    .eq("slug", s)
    .order("reader_public_enabled", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return parseThesisReaderPublicRow(row);
}

/** DB row + catalog ensure fallback — shared by `/read` and `reader-public` API. */
export async function resolveThesisReaderPublicRow(slug: string): Promise<ThesisReaderPublicRow | null> {
  const existing = await fetchThesisReaderPublicRow(slug);
  if (existing) return existing;
  return ensureThesisRowForCatalogSlug(slug);
}

export async function isThesisReaderPublic(slug: string): Promise<boolean> {
  const row = await resolveThesisReaderPublicRow(slug);
  return row?.reader_public_enabled === true;
}

export type SetThesisReaderPublicResult = "ok" | "not_found" | "forbidden";

async function auditReaderPublicChange(
  row: ThesisReaderPublicRow,
  ctx: ThesisReaderPublishingContext,
  enabled: boolean,
  slug: string,
): Promise<void> {
  const svc = createServiceRoleClient();
  if (!svc) return;

  const isOwner = row.owner_user_id === ctx.userId;
  const repo = new SupabaseThesisUpdateRepository(svc);
  try {
    await repo.insert({
      thesis_id: row.id,
      actor_type: ctx.isElevated && !isOwner ? "operator" : "user",
      actor_id: ctx.userId,
      change_type: enabled ? "reader_public_enabled" : "reader_public_disabled",
      reason: enabled ? "Public reader link enabled" : "Public reader link disabled",
      old_values: { reader_public_enabled: !enabled, slug },
      new_values: { reader_public_enabled: enabled, slug },
      metadata: {
        slug,
        thesis_origin: row.thesis_origin,
        elevated: ctx.isElevated,
      },
    });
  } catch (err) {
    console.error("[DEPTH4] reader_public audit write failed", {
      thesisId: row.id,
      slug,
      err,
    });
  }
}

export async function setThesisReaderPublic(
  slug: string,
  enabled: boolean,
  ctx: ThesisReaderPublishingContext,
): Promise<SetThesisReaderPublicResult> {
  const row = await resolveThesisReaderPublicRow(slug);
  if (!row) return "not_found";
  if (!canManageThesisReaderPublic(row, ctx)) return "forbidden";

  const svc = createServiceRoleClient();
  if (!svc) return "forbidden";

  const patch: Record<string, unknown> = {
    reader_public_enabled: enabled,
    updated_at: new Date().toISOString(),
  };
  if (!enabled) {
    patch.reader_public_discoverable = false;
    patch.reader_discovery_label = null;
    patch.reader_discovery_priority = 0;
  }

  const { error } = await svc.from("theses").update(patch).eq("id", row.id);

  if (error) return "forbidden";

  await auditReaderPublicChange(row, ctx, enabled, slug);
  return "ok";
}

/** Re-export for API routes. */
export { canManageThesisReaderPublic } from "@/lib/thesis-engine-v2/thesis-reader-publishing-access";

/**
 * Read-only bundle for anonymous reader when `reader_public_enabled` is true.
 * Service-role load — never exposed to client except rendered reader fields.
 */
export async function loadPublicThesisReaderBundle(slug: string): Promise<ThesisDetailBundle | null> {
  const publicRow = await resolveThesisReaderPublicRow(slug);
  if (!publicRow?.reader_public_enabled) return null;

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
    .order("updated_at", { ascending: false })
    .limit(1);

  const dataRow = Array.isArray(data) ? data[0] : data;
  if (error || !dataRow) return null;

  const thesis = userThesisFromSupabaseRow(dataRow as Parameters<typeof userThesisFromSupabaseRow>[0]);
  const parsed = parseScenarioProbabilities(
    (dataRow as { scenario_probabilities?: unknown }).scenario_probabilities,
  );
  let bundle = bundleForUserThesis(thesis, { scenarioProbabilitiesFromDb: parsed != null });

  const body = (dataRow as { body?: unknown }).body;
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
