import type { ThesesPagePreferences, ThesesSortMode } from "@/lib/theses/theses-page-preferences";
import type { CausalGraphClustersResponse, CausalThesis, ThesisCluster } from "@/types/causal-graph";

function isTradeableStatus(status: string): boolean {
  return status === "ready" || status === "active";
}

function passesOriginFilter(
  thesis: CausalThesis,
  meta: { status: string; thesisOrigin: string | null } | undefined,
  prefs: ThesesPagePreferences,
): boolean {
  const origin = meta?.thesisOrigin ?? "ai_generated";
  if (origin === "user" && !prefs.showUserCreated) return false;
  if (origin !== "user" && !prefs.showAiGenerated) return false;
  const status = meta?.status ?? "ready";
  if (status === "watching" && !prefs.showWatching) return false;
  if (isTradeableStatus(status) && !prefs.showTradeable) return false;
  return true;
}

function sortTheses(theses: CausalThesis[], sort: ThesesSortMode): CausalThesis[] {
  const list = [...theses];
  switch (sort) {
    case "quality":
      return list.sort((a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0));
    case "asset":
      return list.sort((a, b) => a.targetAssetSymbol.localeCompare(b.targetAssetSymbol));
    case "updated":
      return list;
    case "edge":
    default:
      return list.sort((a, b) => b.mispricingScore - a.mispricingScore);
  }
}

export function applyThesesPageFiltersToGraph(
  graph: CausalGraphClustersResponse,
  prefs: ThesesPagePreferences,
): CausalGraphClustersResponse {
  const meta = graph.thesisMetaById ?? {};
  const filterThesis = (t: CausalThesis) => passesOriginFilter(t, meta[t.id], prefs);

  const clusters: ThesisCluster[] = graph.clusters
    .map((c) => ({
      ...c,
      theses: sortTheses(c.theses.filter(filterThesis), prefs.sort),
    }))
    .filter((c) => c.theses.length > 0);

  const isolated = sortTheses(graph.isolated.filter(filterThesis), prefs.sort);
  const drafts = sortTheses(graph.drafts.filter(filterThesis), prefs.sort);
  const totalTheses = clusters.reduce((n, c) => n + c.theses.length, 0) + isolated.length;

  return { ...graph, clusters, isolated, drafts, totalTheses };
}
