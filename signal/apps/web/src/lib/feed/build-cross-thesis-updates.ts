import type { CausalThesis, GlobalCausalGraph, ThesisCluster } from "@/types/causal-graph";
import type { CrossThesisUpdate, CrossThesisUpdateSeverity } from "@/types/feed";

const SEVERITY_RANK: Record<CrossThesisUpdateSeverity, number> = {
  conflict: 0,
  opportunity: 1,
  info: 2,
};

function directionWord(d: "up" | "down"): string {
  return d === "up" ? "UP" : "DOWN";
}

function focalThesesInCluster(cluster: ThesisCluster, focalSlugs: Set<string>): CausalThesis[] {
  return cluster.theses.filter((t) => focalSlugs.has(t.slug));
}

function hasFocal(focal: CausalThesis[], slug: string): boolean {
  return focal.some((t) => t.slug === slug);
}

function conflictUpdates(
  cluster: ThesisCluster,
  focal: CausalThesis[],
  timestamp: string,
): CrossThesisUpdate[] {
  const out: CrossThesisUpdate[] = [];
  const eventId = cluster.event.id;
  const seen = new Set<string>();

  for (let i = 0; i < focal.length; i++) {
    for (let j = i + 1; j < focal.length; j++) {
      const a = focal[i]!;
      const b = focal[j]!;
      if (a.targetAssetSymbol.toUpperCase() !== b.targetAssetSymbol.toUpperCase()) continue;
      if (a.direction === b.direction) continue;
      const key = [a.slug, b.slug].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: `conflict-asset-${key}-${eventId}`,
        type: "cross_thesis_update",
        message: `Your ${a.targetAssetSymbol} thesis expects ${directionWord(a.direction)}, but your ${b.targetAssetSymbol} thesis (${b.title}) implies ${directionWord(b.direction)}.`,
        affectedThesisSlug: a.slug,
        affectingThesisSlug: b.slug,
        sharedEventId: eventId,
        severity: "conflict",
        timestamp,
        read: false,
      });
    }
  }

  const byTitle = new Map(cluster.theses.map((t) => [t.title, t]));
  for (const w of cluster.conflictWarnings) {
    const ta = byTitle.get(w.thesisA);
    const tb = byTitle.get(w.thesisB);
    if (!ta || !tb) continue;
    if (!hasFocal(focal, ta.slug) && !hasFocal(focal, tb.slug)) continue;
    const key = [ta.slug, tb.slug].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    const affected = hasFocal(focal, ta.slug) ? ta : tb;
    const affecting =
      hasFocal(focal, ta.slug) && hasFocal(focal, tb.slug)
        ? ta.slug === affected.slug
          ? tb
          : ta
        : hasFocal(focal, ta.slug)
          ? tb
          : ta;
    out.push({
      id: `conflict-rel-${key}-${eventId}`,
      type: "cross_thesis_update",
      message: w.conflict,
      affectedThesisSlug: affected.slug,
      affectingThesisSlug: affecting.slug,
      sharedEventId: eventId,
      severity: "conflict",
      timestamp,
      read: false,
    });
  }
  return out;
}

function opportunityUpdates(
  cluster: ThesisCluster,
  focal: CausalThesis[],
  timestamp: string,
): CrossThesisUpdate[] {
  const out: CrossThesisUpdate[] = [];
  const eventId = cluster.event.id;
  const seen = new Set<string>();
  const anchor = focal[0]!;

  for (const effect of cluster.impliedEffects) {
    if (effect.hasDedicatedThesis) continue;
    const key = effect.assetSymbol.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const move =
      effect.netDirection === "up" ? "rise" : effect.netDirection === "down" ? "fall" : "move";
    const weak = effect.netStrength < 30 ? " · weak signal" : "";
    out.push({
      id: `opportunity-${key}-${eventId}`,
      type: "cross_thesis_update",
      message: `★ ${effect.assetSymbol} implied ${move} from "${cluster.event.title}" (no dedicated thesis yet)${weak} — consider creating one`,
      affectedThesisSlug: anchor.slug,
      affectingThesisSlug: anchor.slug,
      sharedEventId: eventId,
      severity: "opportunity",
      timestamp,
      read: false,
    });
  }
  return out;
}

function infoUpdates(cluster: ThesisCluster, focal: CausalThesis[], timestamp: string): CrossThesisUpdate[] {
  const out: CrossThesisUpdate[] = [];
  const eventId = cluster.event.id;
  for (let i = 0; i < focal.length; i++) {
    for (let j = i + 1; j < focal.length; j++) {
      const a = focal[i]!;
      const b = focal[j]!;
      const key = [a.slug, b.slug].sort().join("|");
      out.push({
        id: `info-${key}-${eventId}`,
        type: "cross_thesis_update",
        message: `Your ${a.targetAssetSymbol} thesis shares "${cluster.event.title}" with ${b.targetAssetSymbol} (${b.statement || b.title}).`,
        affectedThesisSlug: a.slug,
        affectingThesisSlug: b.slug,
        sharedEventId: eventId,
        severity: "info",
        timestamp,
        read: false,
      });
    }
  }
  return out;
}

function matchesContext(u: CrossThesisUpdate, context?: string | null): boolean {
  if (!context?.trim()) return true;
  return u.affectedThesisSlug === context || u.affectingThesisSlug === context;
}

/** Build cross-thesis feed items from the global causal graph for starred (focal) theses. */
export function buildCrossThesisUpdates(
  graph: GlobalCausalGraph,
  focalSlugs: Set<string>,
  timestamp: string = graph.lastUpdated,
  contextThesisSlug?: string | null,
): CrossThesisUpdate[] {
  const effective = new Set(focalSlugs);
  if (contextThesisSlug?.trim()) effective.add(contextThesisSlug.trim());
  if (effective.size === 0) return [];

  const updates: CrossThesisUpdate[] = [];
  for (const cluster of graph.clusters) {
    const focal = focalThesesInCluster(cluster, effective);
    if (focal.length === 0) continue;
    updates.push(...conflictUpdates(cluster, focal, timestamp));
    updates.push(...opportunityUpdates(cluster, focal, timestamp));
    if (focal.length >= 2) updates.push(...infoUpdates(cluster, focal, timestamp));
  }

  const deduped = new Map<string, CrossThesisUpdate>();
  for (const u of updates.filter((x) => matchesContext(x, contextThesisSlug))) {
    deduped.set(u.id, u);
  }

  return Array.from(deduped.values()).sort((a, b) => {
    const s = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (s !== 0) return s;
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });
}
