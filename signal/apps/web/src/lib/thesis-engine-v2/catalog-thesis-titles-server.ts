import type { SupabaseClient } from "@supabase/supabase-js";
import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { SYSTEM_THESIS_IDS } from "@/lib/thesis-engine-v2/system-thesis-ids";

export type CatalogThesisTitleRow = {
  id: string;
  slug: string | null;
  title: string;
  micro_label?: string | null;
};

const CATALOG_THESIS_IDS = Array.from(new Set<string>(Object.values(SYSTEM_THESIS_IDS)));

/** Load `title` + optional `micro_label` for seeded catalog theses. */
export async function fetchCatalogThesisTitleRows(supabase: SupabaseClient): Promise<CatalogThesisTitleRow[]> {
  if (!CATALOG_THESIS_IDS.length) return [];

  const { data, error } = await supabase.from("theses").select("id, slug, title, micro_label").in("id", CATALOG_THESIS_IDS);
  if (error || !data?.length) return [];

  return (data as CatalogThesisTitleRow[]).filter((r) => typeof r.id === "string" && typeof r.title === "string");
}

/** Prefer Supabase `title` / `micro_label` when present; keep mock body otherwise. */
export function mergeCatalogThesesWithDbTitles(theses: Thesis[], rows: CatalogThesisTitleRow[]): Thesis[] {
  const byIdTitle = new Map<string, string>();
  const byIdMicro = new Map<string, string>();
  for (const r of rows) {
    const id = (r.id ?? "").trim();
    const title = (r.title ?? "").trim();
    const micro = (r.micro_label ?? "").trim();
    if (id && title) byIdTitle.set(id, title);
    if (id && micro) byIdMicro.set(id, micro);
  }
  return theses.map((t) => {
    const dbTitle = byIdTitle.get(t.id);
    const dbMicro = byIdMicro.get(t.id);
    return {
      ...t,
      ...(dbTitle ? { title: dbTitle } : {}),
      ...(dbMicro ? { microLabel: dbMicro } : {}),
    };
  });
}

export type CatalogThesisHeader = { title: string | null; microLabel: string | null };

export async function fetchCatalogThesisHeaderBySlug(supabase: SupabaseClient, slug: string): Promise<CatalogThesisHeader> {
  const s = slug.trim();
  if (!s) return { title: null, microLabel: null };

  const { data, error } = await supabase.from("theses").select("title, micro_label").eq("slug", s).maybeSingle();
  if (error || !data) return { title: null, microLabel: null };

  const row = data as { title?: unknown; micro_label?: unknown };
  const title = typeof row.title === "string" ? row.title.trim() : "";
  const microLabel = typeof row.micro_label === "string" ? row.micro_label.trim() : "";
  return {
    title: title || null,
    microLabel: microLabel || null,
  };
}

/** @deprecated Use fetchCatalogThesisHeaderBySlug */
export async function fetchCatalogThesisTitleBySlug(supabase: SupabaseClient, slug: string): Promise<string | null> {
  const h = await fetchCatalogThesisHeaderBySlug(supabase, slug);
  return h.title;
}
