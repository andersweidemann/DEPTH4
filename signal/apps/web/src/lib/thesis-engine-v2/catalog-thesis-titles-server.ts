import type { SupabaseClient } from "@supabase/supabase-js";
import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { SYSTEM_THESIS_IDS } from "@/lib/thesis-engine-v2/system-thesis-ids";

export type CatalogThesisTitleRow = { id: string; slug: string | null; title: string };

const CATALOG_THESIS_IDS = Array.from(new Set<string>(Object.values(SYSTEM_THESIS_IDS)));

/** Load display titles for seeded catalog theses (`public.theses.title`). */
export async function fetchCatalogThesisTitleRows(supabase: SupabaseClient): Promise<CatalogThesisTitleRow[]> {
  if (!CATALOG_THESIS_IDS.length) return [];

  const { data, error } = await supabase.from("theses").select("id, slug, title").in("id", CATALOG_THESIS_IDS);
  if (error || !data?.length) return [];

  return (data as CatalogThesisTitleRow[]).filter((r) => typeof r.id === "string" && typeof r.title === "string");
}

/** Prefer Supabase `title` for each catalog thesis; keep mock body when a row is missing. */
export function mergeCatalogThesesWithDbTitles(theses: Thesis[], rows: CatalogThesisTitleRow[]): Thesis[] {
  const byId = new Map<string, string>();
  for (const r of rows) {
    const id = (r.id ?? "").trim();
    const title = (r.title ?? "").trim();
    if (id && title) byId.set(id, title);
  }
  return theses.map((t) => {
    const dbTitle = byId.get(t.id);
    return dbTitle ? { ...t, title: dbTitle } : t;
  });
}

export async function fetchCatalogThesisTitleBySlug(
  supabase: SupabaseClient,
  slug: string,
): Promise<string | null> {
  const s = slug.trim();
  if (!s) return null;

  const { data, error } = await supabase.from("theses").select("title").eq("slug", s).maybeSingle();
  if (error || !data || typeof (data as { title?: unknown }).title !== "string") return null;
  const title = ((data as { title: string }).title ?? "").trim();
  return title || null;
}
