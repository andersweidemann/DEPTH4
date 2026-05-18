import type { CausalAffect, CausalThesis, ClusterImpliedEffect, ThesisCluster } from "@/types/causal-graph";

export const PRICED_IN_HIDE_THRESHOLD = 80;
export const MISPRICING_HIDE_THRESHOLD = 30;

export function filterAffect(a: CausalAffect, hidePricedIn: boolean): boolean {
  if (!hidePricedIn) return true;
  return a.pricedInPercent <= PRICED_IN_HIDE_THRESHOLD;
}

export function filterThesis(t: CausalThesis, hidePricedIn: boolean): boolean {
  if (!hidePricedIn) return true;
  return t.mispricingScore >= MISPRICING_HIDE_THRESHOLD;
}

export function filterImpliedEffect(e: ClusterImpliedEffect, hidePricedIn: boolean): boolean {
  if (!hidePricedIn) return true;
  return e.pricedInPercent <= PRICED_IN_HIDE_THRESHOLD;
}

export function filterCluster(
  cluster: ThesisCluster,
  hidePricedIn: boolean,
): ThesisCluster {
  return {
    ...cluster,
    theses: cluster.theses
      .filter((t) => filterThesis(t, hidePricedIn))
      .map((t) => ({
        ...t,
        affects: t.affects.filter((a) => filterAffect(a, hidePricedIn)),
      })),
    impliedEffects: cluster.impliedEffects.filter((e) => filterImpliedEffect(e, hidePricedIn)),
  };
}

export function clusterHasVisibleContent(cluster: ThesisCluster, hidePricedIn: boolean): boolean {
  const filtered = filterCluster(cluster, hidePricedIn);
  return filtered.theses.length > 0 || filtered.impliedEffects.length > 0;
}
