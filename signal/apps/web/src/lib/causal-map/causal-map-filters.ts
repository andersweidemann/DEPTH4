import {
  computeIsolatedConflictWarnings,
  thesisIdsInIsolatedConflicts,
} from "@/lib/causal-map/resolve-thesis-map-symbol";
import type {
  CausalAffect,
  CausalThesis,
  ClusterImpliedEffect,
  ConflictWarning,
  ThesisCluster,
} from "@/types/causal-graph";

/** Hide affects/theses when market priced-in is at or above this percent. */
export const PRICED_IN_HIDE_THRESHOLD = 70;

export function thesisPricedInPercent(t: CausalThesis): number {
  if (t.pricedInEstimate != null && Number.isFinite(t.pricedInEstimate)) {
    return t.pricedInEstimate;
  }
  const targetAffect = t.affects.find((a) => a.hasDedicatedThesis);
  if (targetAffect?.pricedInPercent != null) return targetAffect.pricedInPercent;
  if (t.affects.length > 0) {
    const avg =
      t.affects.reduce((sum, a) => sum + a.pricedInPercent, 0) / Math.max(1, t.affects.length);
    return Math.round(avg);
  }
  return 50;
}

export function filterAffect(a: CausalAffect, hidePricedIn: boolean): boolean {
  if (!hidePricedIn) return true;
  return a.pricedInPercent < PRICED_IN_HIDE_THRESHOLD;
}

export function filterThesis(t: CausalThesis, hidePricedIn: boolean): boolean {
  if (!hidePricedIn) return true;
  return thesisPricedInPercent(t) < PRICED_IN_HIDE_THRESHOLD;
}

export function filterImpliedEffect(e: ClusterImpliedEffect, hidePricedIn: boolean): boolean {
  if (!hidePricedIn) return true;
  return e.pricedInPercent < PRICED_IN_HIDE_THRESHOLD;
}

export function thesisInConflictWarnings(thesis: CausalThesis, warnings: ConflictWarning[]): boolean {
  if (warnings.length === 0) return false;
  return warnings.some((w) => w.thesisA === thesis.title || w.thesisB === thesis.title);
}

export function filterCluster(
  cluster: ThesisCluster,
  hidePricedIn: boolean,
  showConflictsOnly = false,
): ThesisCluster {
  let theses = cluster.theses
    .filter((t) => filterThesis(t, hidePricedIn))
    .map((t) => ({
      ...t,
      affects: t.affects.filter((a) => filterAffect(a, hidePricedIn)),
    }));

  if (showConflictsOnly) {
    theses = theses.filter((t) => thesisInConflictWarnings(t, cluster.conflictWarnings));
  }

  return {
    ...cluster,
    theses,
    impliedEffects: cluster.impliedEffects.filter((e) => filterImpliedEffect(e, hidePricedIn)),
  };
}

export function filterIsolatedTheses(
  theses: CausalThesis[],
  hidePricedIn: boolean,
  showConflictsOnly = false,
): CausalThesis[] {
  const filtered = theses.filter((t) => filterThesis(t, hidePricedIn));
  if (!showConflictsOnly) return filtered;

  const conflictIds = thesisIdsInIsolatedConflicts(filtered);
  return filtered.filter((t) => conflictIds.has(t.id));
}

export function countVisibleConflicts(
  clusters: ThesisCluster[],
  isolated: CausalThesis[],
  hidePricedIn: boolean,
  showConflictsOnly: boolean,
): number {
  if (!showConflictsOnly) return 0;
  let n = 0;
  for (const c of clusters) {
    const fc = filterCluster(c, hidePricedIn, true);
    n += fc.theses.length;
  }
  n += filterIsolatedTheses(isolated, hidePricedIn, true).length;
  return n;
}

export function isolatedConflictWarningsFor(theses: CausalThesis[]): ConflictWarning[] {
  return computeIsolatedConflictWarnings(theses);
}

export function clusterHasVisibleContent(
  cluster: ThesisCluster,
  hidePricedIn: boolean,
  showConflictsOnly = false,
): boolean {
  const filtered = filterCluster(cluster, hidePricedIn, showConflictsOnly);
  return filtered.theses.length > 0 || filtered.impliedEffects.length > 0;
}
