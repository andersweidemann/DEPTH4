import type { SupabaseClient } from "@supabase/supabase-js";

/** Resolve catalog thesis UUIDs to `/theses/[slug]` slugs. */
export async function fetchThesisSlugMap(supabase: SupabaseClient, thesisIds: string[]): Promise<Map<string, string>> {
  const uniq = Array.from(new Set(thesisIds.map((id) => id.trim()).filter(Boolean)));
  if (!uniq.length) return new Map();

  const { data, error } = await supabase.from("theses").select("id, slug").in("id", uniq);
  if (error || !data) return new Map();

  return new Map(data.map((r: { id: string; slug: string }) => [r.id, r.slug]));
}
