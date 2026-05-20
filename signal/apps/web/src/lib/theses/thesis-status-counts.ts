import type { SupabaseClient } from "@supabase/supabase-js";

export type ThesisStatusCounts = {
  active: number;
  watching: number;
  archived: number;
};

export async function fetchThesisStatusCounts(sb: SupabaseClient): Promise<ThesisStatusCounts> {
  const statuses = ["active", "ready", "watching", "archived"] as const;
  const out: ThesisStatusCounts = { active: 0, watching: 0, archived: 0 };

  await Promise.all(
    statuses.map(async (status) => {
      const { count, error } = await sb
        .from("theses")
        .select("id", { count: "exact", head: true })
        .eq("status", status);
      if (error || count == null) return;
      if (status === "watching") out.watching = count;
      else if (status === "archived") out.archived = count;
      else out.active += count;
    }),
  );

  return out;
}
