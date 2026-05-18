import type { CausalThesis, ThesisCluster } from "@/types/causal-graph";
import type { ThesisListItem } from "@/types/thesis";

export type ClusterListFilter = "all" | "starred" | "ready";

export function listItemPassesFilter(item: ThesisListItem, filter: ClusterListFilter): boolean {
  if (filter === "starred") return item.starred;
  if (filter === "ready") return item.status === "Ready";
  return true;
}

export function filterClusterTheses(
  cluster: ThesisCluster,
  listBySlug: Map<string, ThesisListItem>,
  allowedSlugs: Set<string> | null,
  filter: ClusterListFilter,
): ThesisListItem[] {
  const rows: ThesisListItem[] = [];
  for (const t of cluster.theses) {
    const item = listBySlug.get(t.slug);
    if (!item) continue;
    if (allowedSlugs && !allowedSlugs.has(t.slug)) continue;
    if (!listItemPassesFilter(item, filter)) continue;
    rows.push(item);
  }
  return rows;
}

export function filterIsolatedTheses(
  isolated: CausalThesis[],
  listBySlug: Map<string, ThesisListItem>,
  allowedSlugs: Set<string> | null,
  filter: ClusterListFilter,
): ThesisListItem[] {
  const rows: ThesisListItem[] = [];
  for (const t of isolated) {
    const item = listBySlug.get(t.slug);
    if (!item) continue;
    if (allowedSlugs && !allowedSlugs.has(t.slug)) continue;
    if (!listItemPassesFilter(item, filter)) continue;
    rows.push(item);
  }
  return rows;
}
