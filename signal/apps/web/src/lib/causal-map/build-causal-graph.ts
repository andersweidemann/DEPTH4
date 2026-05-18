import type { SupabaseClient } from "@supabase/supabase-js";
import { getThesisDetail } from "@/lib/thesis-engine-v2/catalog-data";
import { parseScenarioProbabilities } from "@/lib/thesis-engine-v2/catalog-thesis-titles-server";
import { getThesisMispricing } from "@/lib/thesis-engine-v2/mispricing";
import { mergeDbBodyIntoThesis } from "@/lib/thesis-engine-v2/thesis-db-body";
import { thesisConvictionPctFromDbTriple } from "@/lib/thesis-engine-v2/thesis-display-scenarios";
import type { Thesis } from "@/lib/thesis-engine-v2/types";
import type {
  CausalAffect,
  CausalEvent,
  CausalEventStatus,
  CausalThesis,
  ClusterImpliedEffect,
  ConflictWarning,
  EventCategory,
  CausalGraphClustersResponse,
  GlobalCausalGraph,
  ThesisCluster,
} from "@/types/causal-graph";

export type EventRow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  category: string;
  status: string;
  confidence: number;
  first_detected: string;
  last_updated: string;
};

export type AssetRow = {
  id: string;
  symbol: string;
  name: string;
};

export type AffectRow = {
  id: string;
  thesis_id: string;
  asset_id: string;
  direction: string;
  strength: number;
  priced_in_percent: number;
  mispricing_score: number;
  why_it_matters: string | null;
  has_dedicated_thesis: boolean;
  thesis_slug: string | null;
};

export type ThesisRow = {
  id: string;
  slug: string | null;
  title: string;
  status: string;
  scenario_probabilities: unknown;
  body: unknown;
  thesis_score: number | null;
  priced_in_estimate: number | null;
  micro_label: string | null;
};

export type LinkRow = { event_id: string; thesis_id: string; is_primary: boolean };

type RelationRow = {
  from_thesis_id: string;
  to_thesis_id: string;
  relation_type: string;
};

const LIVE_STATUSES = new Set(["forming", "watching", "ready", "active"]);

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

function mapEventStatus(status: string): CausalEventStatus {
  if (status === "resolved" || status === "faded") return status;
  return "active";
}

export function mapEvent(row: EventRow): CausalEvent {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description?.trim() || "",
    category: row.category as EventCategory,
    status: mapEventStatus(row.status),
    confidence: row.confidence,
    firstDetected: row.first_detected,
  };
}

function directionFromThesis(direction: string): "up" | "down" {
  if (direction === "long") return "up";
  if (direction === "short") return "down";
  return "down";
}

function thesisMispricingScore(row: ThesisRow, slug: string | null): number {
  if (row.priced_in_estimate != null && row.scenario_probabilities) {
    const triple = parseScenarioProbabilities(row.scenario_probabilities);
    if (triple) {
      const conviction = thesisConvictionPctFromDbTriple(triple);
      return clamp(conviction - row.priced_in_estimate, 0, 100);
    }
  }
  if (row.thesis_score != null && Number.isFinite(row.thesis_score)) {
    const s = row.thesis_score;
    return clamp(s <= 1 ? s * 100 : s, 0, 100);
  }
  if (slug) {
    const bundle = getThesisDetail(slug);
    if (bundle) return getThesisMispricing(bundle.thesis).score;
  }
  return 50;
}

export function buildCausalThesis(row: ThesisRow, affects: CausalAffect[]): CausalThesis {
  const slug = row.slug?.trim() || row.id;
  const bundle = slug ? getThesisDetail(slug) : null;
  let thesis: Thesis | null = bundle?.thesis ?? null;
  if (thesis && row.body) {
    thesis = mergeDbBodyIntoThesis(thesis, row.body);
  }
  const triple = parseScenarioProbabilities(row.scenario_probabilities);
  const direction = thesis ? directionFromThesis(thesis.direction) : "down";
  const asset = thesis?.asset?.trim() || "—";
  const conviction = triple ? thesisConvictionPctFromDbTriple(triple) : thesis?.probability ?? 50;

  return {
    id: row.id,
    slug,
    title: row.micro_label?.trim() || thesis?.title || row.title,
    statement: thesis?.thesisStatement || thesis?.oneLineSummary || row.title,
    targetAssetSymbol: asset.length > 12 ? asset.split(/[\s/]/)[0]! : asset,
    direction,
    conviction,
    mispricingScore: thesisMispricingScore(row, slug),
    affects,
  };
}

export function mapAffect(row: AffectRow, assetById: Map<string, AssetRow>): CausalAffect | null {
  const asset = assetById.get(row.asset_id);
  if (!asset) return null;
  const dir = row.direction === "up" || row.direction === "down" || row.direction === "neutral" ? row.direction : "neutral";
  return {
    assetSymbol: asset.symbol,
    direction: dir,
    strength: row.strength,
    pricedInPercent: row.priced_in_percent,
    mispricingScore: row.mispricing_score,
    whyItMatters: row.why_it_matters?.trim() || "",
    hasDedicatedThesis: row.has_dedicated_thesis,
    thesisSlug: row.thesis_slug ?? undefined,
  };
}

export function computeImpliedEffects(clusterTheses: CausalThesis[]): ClusterImpliedEffect[] {
  const byAsset = new Map<
    string,
    {
      directions: ("up" | "down" | "neutral")[];
      strengths: number[];
      pricedIns: number[];
      fromTheses: Set<string>;
      why: string;
      hasDedicated: boolean;
      thesisSlug?: string;
    }
  >();

  const primarySymbols = new Set(clusterTheses.map((t) => t.targetAssetSymbol.toUpperCase()));

  for (const thesis of clusterTheses) {
    for (const affect of thesis.affects) {
      if (primarySymbols.has(affect.assetSymbol.toUpperCase()) && affect.hasDedicatedThesis) continue;
      const cur = byAsset.get(affect.assetSymbol) ?? {
        directions: [],
        strengths: [],
        pricedIns: [],
        fromTheses: new Set<string>(),
        why: affect.whyItMatters,
        hasDedicated: affect.hasDedicatedThesis,
        thesisSlug: affect.thesisSlug,
      };
      cur.directions.push(affect.direction);
      cur.strengths.push(affect.strength);
      cur.pricedIns.push(affect.pricedInPercent);
      cur.fromTheses.add(thesis.title);
      if (!cur.hasDedicated) cur.hasDedicated = affect.hasDedicatedThesis;
      if (affect.thesisSlug) cur.thesisSlug = affect.thesisSlug;
      byAsset.set(affect.assetSymbol, cur);
    }
  }

  const effects: ClusterImpliedEffect[] = [];
  for (const [symbol, agg] of Array.from(byAsset.entries())) {
    const up = agg.directions.filter((d: "up" | "down" | "neutral") => d === "up").length;
    const down = agg.directions.filter((d: "up" | "down" | "neutral") => d === "down").length;
    const netDirection: "up" | "down" | "neutral" =
      up > down ? "up" : down > up ? "down" : agg.directions[0] ?? "neutral";
    const avgStrength = Math.round(
      agg.strengths.reduce((a: number, b: number) => a + b, 0) / agg.strengths.length,
    );
    const avgPricedIn = Math.round(
      agg.pricedIns.reduce((a: number, b: number) => a + b, 0) / agg.pricedIns.length,
    );

    effects.push({
      id: `implied-${symbol}`,
      assetSymbol: symbol,
      netDirection,
      netStrength: avgStrength,
      pricedInPercent: avgPricedIn,
      fromTheses: Array.from(agg.fromTheses),
      hasDedicatedThesis: agg.hasDedicated,
      whyItMatters: agg.why || `Ripple into ${symbol} from cluster theses`,
      thesisSlug: agg.thesisSlug,
    });
  }

  return effects.sort((a, b) => a.pricedInPercent - b.pricedInPercent);
}

function computeConflictWarnings(
  clusterTheses: CausalThesis[],
  relations: RelationRow[],
): ConflictWarning[] {
  const inCluster = new Set(clusterTheses.map((t) => t.id));
  const byId = new Map(clusterTheses.map((t) => [t.id, t]));
  const warnings: ConflictWarning[] = [];

  for (const rel of relations) {
    if (rel.relation_type !== "contradicts") continue;
    if (!inCluster.has(rel.from_thesis_id) || !inCluster.has(rel.to_thesis_id)) continue;
    const a = byId.get(rel.from_thesis_id)!;
    const b = byId.get(rel.to_thesis_id)!;
    warnings.push({
      thesisA: a.title,
      thesisB: b.title,
      conflict: `${a.title} and ${b.title} pull the same event in opposite ways — reconcile portfolio exposure before sizing both.`,
    });
  }

  const byAsset = new Map<string, CausalThesis[]>();
  for (const t of clusterTheses) {
    const key = t.targetAssetSymbol.toUpperCase();
    const list = byAsset.get(key) ?? [];
    list.push(t);
    byAsset.set(key, list);
  }
  for (const list of Array.from(byAsset.values())) {
    if (list.length < 2) continue;
    const hasUp = list.some((t: CausalThesis) => t.direction === "up");
    const hasDown = list.some((t: CausalThesis) => t.direction === "down");
    if (hasUp && hasDown) {
      const names = list.map((t) => t.title).join(" vs ");
      if (!warnings.some((w) => w.conflict.includes(names))) {
        warnings.push({
          thesisA: list[0]!.title,
          thesisB: list[1]!.title,
          conflict: `Opposing directions on ${list[0]!.targetAssetSymbol}: ${names}.`,
        });
      }
    }
  }

  return warnings;
}

export async function buildGlobalCausalGraph(supabase: SupabaseClient): Promise<GlobalCausalGraph> {
  const [
    eventsRes,
    assetsRes,
    linksRes,
    relationsRes,
    affectsRes,
    thesesRes,
  ] = await Promise.all([
    supabase.from("causal_events").select("*").eq("status", "active").order("confidence", { ascending: false }),
    supabase.from("causal_assets").select("id, symbol, name"),
    supabase.from("event_thesis_links").select("event_id, thesis_id, is_primary"),
    supabase.from("thesis_relations").select("from_thesis_id, to_thesis_id, relation_type"),
    supabase
      .from("causal_affects")
      .select(
        "id, thesis_id, asset_id, direction, strength, priced_in_percent, mispricing_score, why_it_matters, has_dedicated_thesis, thesis_slug",
      ),
    supabase
      .from("theses")
      .select("id, slug, title, status, scenario_probabilities, body, thesis_score, priced_in_estimate, micro_label")
      .in("status", Array.from(LIVE_STATUSES)),
  ]);

  if (eventsRes.error) throw eventsRes.error;
  if (assetsRes.error) throw assetsRes.error;
  if (linksRes.error) throw linksRes.error;
  if (relationsRes.error) throw relationsRes.error;
  if (affectsRes.error) throw affectsRes.error;
  if (thesesRes.error) throw thesesRes.error;

  const events = (eventsRes.data ?? []) as EventRow[];
  const assets = (assetsRes.data ?? []) as AssetRow[];
  const links = (linksRes.data ?? []) as LinkRow[];
  const relations = (relationsRes.data ?? []) as RelationRow[];
  const affectRows = (affectsRes.data ?? []) as AffectRow[];
  const thesisRows = (thesesRes.data ?? []) as ThesisRow[];

  const assetById = new Map(assets.map((a) => [a.id, a]));
  const thesisById = new Map(thesisRows.map((t) => [t.id, t]));

  const affectsByThesis = new Map<string, CausalAffect[]>();
  for (const row of affectRows) {
    const mapped = mapAffect(row, assetById);
    if (!mapped) continue;
    const list = affectsByThesis.get(row.thesis_id) ?? [];
    list.push(mapped);
    affectsByThesis.set(row.thesis_id, list);
  }

  const linksByEvent = new Map<string, string[]>();
  for (const link of links) {
    const list = linksByEvent.get(link.event_id) ?? [];
    list.push(link.thesis_id);
    linksByEvent.set(link.event_id, list);
  }

  const clusters: ThesisCluster[] = events.map((event) => {
    const thesisIds = linksByEvent.get(event.id) ?? [];
    const clusterTheses = thesisIds
      .map((id) => thesisById.get(id))
      .filter((row): row is ThesisRow => !!row && LIVE_STATUSES.has(row.status))
      .map((row) => buildCausalThesis(row, affectsByThesis.get(row.id) ?? []));

    const impliedEffects = computeImpliedEffects(clusterTheses);
    const conflictWarnings = computeConflictWarnings(clusterTheses, relations);
    const compositeMispricing =
      clusterTheses.length > 0
        ? Math.round(clusterTheses.reduce((s, t) => s + t.mispricingScore, 0) / clusterTheses.length)
        : 0;

    return {
      event: mapEvent(event),
      theses: clusterTheses,
      impliedEffects,
      conflictWarnings,
      compositeMispricing,
    };
  });

  const totalTheses = clusters.reduce((n, c) => n + c.theses.length, 0);
  const lastUpdated =
    events.length > 0
      ? events.reduce((max, e) => (e.last_updated > max ? e.last_updated : max), events[0]!.last_updated)
      : new Date().toISOString();

  return {
    clusters,
    activeEvents: events.length,
    totalTheses,
    lastUpdated,
  };
}

export async function buildCausalGraphClusters(
  supabase: SupabaseClient,
): Promise<CausalGraphClustersResponse> {
  const graph = await buildGlobalCausalGraph(supabase);

  const linksRes = await supabase.from("event_thesis_links").select("thesis_id");
  if (linksRes.error) throw linksRes.error;

  const linkedIds = new Set((linksRes.data ?? []).map((l: { thesis_id: string }) => l.thesis_id));
  const clusteredIds = new Set(graph.clusters.flatMap((c) => c.theses.map((t) => t.id)));

  const thesesRes = await supabase
    .from("theses")
    .select("id, slug, title, status, scenario_probabilities, body, thesis_score, priced_in_estimate, micro_label")
    .in("status", Array.from(LIVE_STATUSES));

  if (thesesRes.error) throw thesesRes.error;

  const affectsRes = await supabase
    .from("causal_affects")
    .select(
      "id, thesis_id, asset_id, direction, strength, priced_in_percent, mispricing_score, why_it_matters, has_dedicated_thesis, thesis_slug",
    );

  if (affectsRes.error) throw affectsRes.error;

  const assetsRes = await supabase.from("causal_assets").select("id, symbol, name");
  if (assetsRes.error) throw assetsRes.error;

  const assets = (assetsRes.data ?? []) as AssetRow[];
  const assetById = new Map(assets.map((a) => [a.id, a]));
  const affectRows = (affectsRes.data ?? []) as AffectRow[];
  const thesisRows = (thesesRes.data ?? []) as ThesisRow[];

  const affectsByThesis = new Map<string, CausalAffect[]>();
  for (const row of affectRows) {
    const mapped = mapAffect(row, assetById);
    if (!mapped) continue;
    const list = affectsByThesis.get(row.thesis_id) ?? [];
    list.push(mapped);
    affectsByThesis.set(row.thesis_id, list);
  }

  const isolated: CausalThesis[] = [];
  const drafts: CausalThesis[] = [];

  for (const row of thesisRows) {
    if (linkedIds.has(row.id)) continue;
    const causal = buildCausalThesis(row, affectsByThesis.get(row.id) ?? []);
    isolated.push(causal);
    if (row.status === "forming") drafts.push(causal);
  }

  const clusters = graph.clusters.filter((c) => c.theses.length > 0);

  return {
    clusters,
    isolated,
    drafts,
    activeEvents: graph.activeEvents,
    totalTheses: clusteredIds.size + isolated.length,
    lastUpdated: graph.lastUpdated,
  };
}
