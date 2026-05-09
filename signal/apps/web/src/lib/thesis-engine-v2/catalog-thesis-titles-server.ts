import type { SupabaseClient } from "@supabase/supabase-js";
import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { SYSTEM_THESIS_IDS } from "@/lib/thesis-engine-v2/system-thesis-ids";
import { mergeDbBodyIntoThesis, normalizeThesisNarrativeFields } from "@/lib/thesis-engine-v2/thesis-db-body";

export type CatalogThesisTitleRow = {
  id: string;
  slug: string | null;
  title: string;
  micro_label?: string | null;
  body?: unknown | null;
};

const CATALOG_THESIS_IDS = Array.from(new Set<string>(Object.values(SYSTEM_THESIS_IDS)));

/** Load `title`, `micro_label`, and optional `body` for seeded catalog theses. */
export async function fetchCatalogThesisTitleRows(supabase: SupabaseClient): Promise<CatalogThesisTitleRow[]> {
  if (!CATALOG_THESIS_IDS.length) return [];

  const { data, error } = await supabase
    .from("theses")
    .select("id, slug, title, micro_label, body")
    .in("id", CATALOG_THESIS_IDS);
  if (error || !data?.length) return [];

  return (data as CatalogThesisTitleRow[]).filter((r) => typeof r.id === "string" && typeof r.title === "string");
}

/**
 * Prefer Supabase `title` / `micro_label` / `body` when present; keep in-app baseline fallbacks otherwise.
 *
 * @param theses — shipped catalog baseline (`CATALOG_THESES` from `catalog-data.ts`).
 */
export function mergeCatalogThesesWithDbTitles(theses: Thesis[], rows: CatalogThesisTitleRow[]): Thesis[] {
  const byId = new Map<string, CatalogThesisTitleRow>();
  for (const r of rows) {
    const id = (r.id ?? "").trim();
    if (id) byId.set(id, r);
  }
  return theses.map((t) => {
    const row = byId.get(t.id);
    if (!row) return normalizeThesisNarrativeFields(t);
    const dbTitle = (row.title ?? "").trim();
    const dbMicro = (row.micro_label ?? "").trim();
    let next: Thesis = {
      ...t,
      ...(dbTitle ? { title: dbTitle } : {}),
      ...(dbMicro ? { microLabel: dbMicro } : {}),
    };
    next = mergeDbBodyIntoThesis(next, row.body ?? null);
    return next;
  });
}

export type CatalogThesisHeader = { title: string | null; microLabel: string | null; body: unknown | null };

export async function fetchCatalogThesisHeaderBySlug(supabase: SupabaseClient, slug: string): Promise<CatalogThesisHeader> {
  const s = slug.trim();
  if (!s) return { title: null, microLabel: null, body: null };

  const { data, error } = await supabase.from("theses").select("title, micro_label, body").eq("slug", s).maybeSingle();
  if (error || !data) return { title: null, microLabel: null, body: null };

  const row = data as { title?: unknown; micro_label?: unknown; body?: unknown };
  const title = typeof row.title === "string" ? row.title.trim() : "";
  const microLabel = typeof row.micro_label === "string" ? row.micro_label.trim() : "";
  const body = row.body !== undefined && row.body !== null ? row.body : null;
  return {
    title: title || null,
    microLabel: microLabel || null,
    body,
  };
}

/** @deprecated Use fetchCatalogThesisHeaderBySlug */
export async function fetchCatalogThesisTitleBySlug(supabase: SupabaseClient, slug: string): Promise<string | null> {
  const h = await fetchCatalogThesisHeaderBySlug(supabase, slug);
  return h.title;
}
