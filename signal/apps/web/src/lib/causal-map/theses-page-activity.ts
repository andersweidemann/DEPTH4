import type { SupabaseClient } from "@supabase/supabase-js";
import type { CausalGraphClustersResponse } from "@/types/causal-graph";

export type ThesisDailyUpdate = {
  thesisId: string;
  thesisSlug: string;
  thesisTitle: string;
};

export type ThesesPageActivity = {
  dailyUpdates: ThesisDailyUpdate[];
  recentlyUpdatedThesisIds: string[];
  /** Latest `thesis_updates.created_at` in the 24h window (for dismissible banner). */
  latestUpdateAt: string | null;
};

function slugByThesisId(graph: CausalGraphClustersResponse): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of graph.clusters) {
    for (const t of c.theses) m.set(t.id, t.slug);
  }
  for (const t of graph.isolated) m.set(t.id, t.slug);
  return m;
}

export async function loadThesesPageActivity(
  admin: SupabaseClient,
  graph: CausalGraphClustersResponse,
): Promise<ThesesPageActivity> {
  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const { data: rows } = await admin
    .from("thesis_updates")
    .select("thesis_id, change_type, created_at, metadata")
    .gte("created_at", since)
    .in("change_type", ["scenario_shift", "evidence"])
    .order("created_at", { ascending: false })
    .limit(200);

  const slugMap = slugByThesisId(graph);
  const titleById = new Map<string, string>();
  for (const c of graph.clusters) {
    for (const t of c.theses) titleById.set(t.id, t.title);
  }
  for (const t of graph.isolated) titleById.set(t.id, t.title);

  const dailyByThesis = new Map<string, ThesisDailyUpdate>();
  const recentIds = new Set<string>();
  let latestUpdateAt: string | null = null;

  for (const row of rows ?? []) {
    const thesisId = String((row as { thesis_id?: string }).thesis_id ?? "");
    if (!thesisId) continue;
    const slug = slugMap.get(thesisId);
    if (!slug) continue;
    const createdAt = String((row as { created_at?: string }).created_at ?? "");
    if (createdAt && (!latestUpdateAt || createdAt > latestUpdateAt)) latestUpdateAt = createdAt;

    recentIds.add(thesisId);

    if (!dailyByThesis.has(thesisId)) {
      dailyByThesis.set(thesisId, {
        thesisId,
        thesisSlug: slug,
        thesisTitle: titleById.get(thesisId) ?? slug,
      });
    }
  }

  return {
    dailyUpdates: Array.from(dailyByThesis.values()).slice(0, 12),
    recentlyUpdatedThesisIds: Array.from(recentIds),
    latestUpdateAt,
  };
}

export function filterHiddenFromGraph(
  graph: CausalGraphClustersResponse,
  hiddenIds: Set<string>,
): CausalGraphClustersResponse {
  if (!hiddenIds.size) return graph;
  const clusters = graph.clusters
    .map((c) => ({
      ...c,
      theses: c.theses.filter((t) => !hiddenIds.has(t.id)),
    }))
    .filter((c) => c.theses.length > 0 || c.impliedEffects.length > 0);
  const isolated = graph.isolated.filter((t) => !hiddenIds.has(t.id));
  const totalTheses =
    clusters.reduce((n, c) => n + c.theses.length, 0) + isolated.length;
  return { ...graph, clusters, isolated, totalTheses };
}

/** Inverse of {@link filterHiddenFromGraph} — hidden-theses view only. */
export function filterOnlyHiddenFromGraph(
  graph: CausalGraphClustersResponse,
  hiddenIds: Set<string>,
): CausalGraphClustersResponse {
  if (!hiddenIds.size) {
    return { ...graph, clusters: [], isolated: [], totalTheses: 0 };
  }
  const clusters = graph.clusters
    .map((c) => ({
      ...c,
      theses: c.theses.filter((t) => hiddenIds.has(t.id)),
    }))
    .filter((c) => c.theses.length > 0);
  const isolated = graph.isolated.filter((t) => hiddenIds.has(t.id));
  const totalTheses =
    clusters.reduce((n, c) => n + c.theses.length, 0) + isolated.length;
  return { ...graph, clusters, isolated, totalTheses };
}
