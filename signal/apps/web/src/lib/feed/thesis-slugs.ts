import type { SupabaseClient } from "@supabase/supabase-js";
import { getThesisMetaDisplayTitle } from "@/lib/thesis-engine-v2/thesis-display-title";

/** Resolve catalog thesis UUIDs to `/theses/[slug]` slugs. */
export async function fetchThesisSlugMap(supabase: SupabaseClient, thesisIds: string[]): Promise<Map<string, string>> {
  const uniq = Array.from(new Set(thesisIds.map((id) => id.trim()).filter(Boolean)));
  if (!uniq.length) return new Map();

  const { data, error } = await supabase.from("theses").select("id, slug").in("id", uniq);
  if (error || !data) return new Map();

  return new Map(data.map((r: { id: string; slug: string }) => [r.id, r.slug]));
}

export type ThesisMeta = { slug: string; title: string; microLabel: string | null };

/** Resolve thesis UUIDs for UX (`title` = `public.theses.title`, `microLabel` = `public.theses.micro_label`). */
export async function fetchThesisMetaMap(supabase: SupabaseClient, thesisIds: string[]): Promise<Map<string, ThesisMeta>> {
  const uniq = Array.from(new Set(thesisIds.map((id) => id.trim()).filter(Boolean)));
  if (!uniq.length) return new Map();

  const { data, error } = await supabase.from("theses").select("id, slug, title, micro_label").in("id", uniq);
  if (error || !data) return new Map();

  const rows = data as { id?: unknown; slug?: unknown; title?: unknown; micro_label?: unknown }[];
  const pairs: [string, ThesisMeta][] = [];
  for (const r of rows) {
    const id = typeof r.id === "string" ? r.id : String(r.id ?? "").trim();
    const slug = typeof r.slug === "string" ? r.slug : String(r.slug ?? "").trim();
    const rawTitle = typeof r.title === "string" ? r.title : String(r.title ?? "").trim();
    if (!id || !slug || !rawTitle) continue;
    const title = getThesisMetaDisplayTitle({ title: rawTitle });
    const rawMicro = typeof r.micro_label === "string" ? r.micro_label.trim() : "";
    pairs.push([id, { slug, title, microLabel: rawMicro || null }]);
  }
  return new Map(pairs);
}
