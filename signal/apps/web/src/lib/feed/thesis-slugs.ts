import type { SupabaseClient } from "@supabase/supabase-js";

/** Resolve catalog thesis UUIDs to `/theses/[slug]` slugs. */
export async function fetchThesisSlugMap(supabase: SupabaseClient, thesisIds: string[]): Promise<Map<string, string>> {
  const uniq = Array.from(new Set(thesisIds.map((id) => id.trim()).filter(Boolean)));
  if (!uniq.length) return new Map();

  const { data, error } = await supabase.from("theses").select("id, slug").in("id", uniq);
  if (error || !data) return new Map();

  return new Map(data.map((r: { id: string; slug: string }) => [r.id, r.slug]));
}

export type ThesisMeta = { slug: string; title: string };

/** Resolve thesis UUIDs to `{ slug, title }` for UX. */
export async function fetchThesisMetaMap(supabase: SupabaseClient, thesisIds: string[]): Promise<Map<string, ThesisMeta>> {
  const uniq = Array.from(new Set(thesisIds.map((id) => id.trim()).filter(Boolean)));
  if (!uniq.length) return new Map();

  const { data, error } = await supabase.from("theses").select("id, slug, title").in("id", uniq);
  if (error || !data) return new Map();

  return new Map(
    data
      .map((r: { id?: unknown; slug?: unknown; title?: unknown }) => {
        const id = typeof r.id === "string" ? r.id : String(r.id ?? "").trim();
        const slug = typeof r.slug === "string" ? r.slug : String(r.slug ?? "").trim();
        const title = typeof r.title === "string" ? r.title : String(r.title ?? "").trim();
        if (!id || !slug || !title) return null;
        return [id, { slug, title }] as const;
      })
      .filter((x): x is readonly [string, ThesisMeta] => x !== null),
  );
}
