import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CausalAffect,
  CausalAffectWithAsset,
  CausalAsset,
  CausalChainResponse,
} from "@/types/causal-graph";
import {
  buildCausalThesis,
  computeImpliedEffects,
  mapAffect,
  mapEvent,
  type AffectRow,
  type AssetRow,
  type EventRow,
  type LinkRow,
  type ThesisRow,
} from "@/lib/causal-map/build-causal-graph";

function mapAsset(row: AssetRow): CausalAsset {
  return { id: row.id, symbol: row.symbol, name: row.name };
}

function pickTargetAsset(
  targetSymbol: string,
  affects: CausalAffectWithAsset[],
  assetById: Map<string, AssetRow>,
): CausalAsset {
  const sym = targetSymbol.trim().toUpperCase();
  const bySymbol = affects.find((a) => a.asset.symbol.toUpperCase() === sym);
  if (bySymbol) return bySymbol.asset;

  const top = [...affects].sort((a, b) => b.strength - a.strength)[0];
  if (top) return top.asset;

  const fallback = Array.from(assetById.values()).find((a) => a.symbol.toUpperCase() === sym);
  if (fallback) return mapAsset(fallback);

  return { id: "unknown", symbol: targetSymbol || "—", name: targetSymbol || "—" };
}

export async function buildCausalChainForSlug(
  supabase: SupabaseClient,
  slug: string,
): Promise<CausalChainResponse | null> {
  const normalized = slug.trim();
  if (!normalized) return null;

  const thesisRes = await supabase
    .from("theses")
    .select(
      "id, slug, title, status, scenario_probabilities, body, thesis_score, priced_in_estimate, micro_label",
    )
    .eq("slug", normalized)
    .maybeSingle();

  if (thesisRes.error) throw thesisRes.error;
  if (!thesisRes.data) return null;

  const thesisRow = thesisRes.data as ThesisRow;

  const linkRes = await supabase
    .from("event_thesis_links")
    .select("event_id, thesis_id, is_primary")
    .eq("thesis_id", thesisRow.id)
    .order("is_primary", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (linkRes.error) throw linkRes.error;
  if (!linkRes.data) return null;

  const eventId = (linkRes.data as LinkRow).event_id;

  const [eventRes, clusterLinksRes, thesisAffectsRes, assetsRes] = await Promise.all([
    supabase.from("causal_events").select("*").eq("id", eventId).single(),
    supabase.from("event_thesis_links").select("thesis_id").eq("event_id", eventId),
    supabase
      .from("causal_affects")
      .select(
        "id, thesis_id, asset_id, direction, strength, priced_in_percent, mispricing_score, why_it_matters, has_dedicated_thesis, thesis_slug",
      )
      .eq("thesis_id", thesisRow.id),
    supabase.from("causal_assets").select("id, symbol, name"),
  ]);

  if (eventRes.error) throw eventRes.error;
  if (clusterLinksRes.error) throw clusterLinksRes.error;
  if (thesisAffectsRes.error) throw thesisAffectsRes.error;
  if (assetsRes.error) throw assetsRes.error;

  const event = eventRes.data as EventRow;
  const clusterThesisIds = (clusterLinksRes.data ?? []).map((l: { thesis_id: string }) => l.thesis_id);
  const assets = (assetsRes.data ?? []) as AssetRow[];
  const assetById = new Map(assets.map((a) => [a.id, a]));

  const affectsWithAsset: CausalAffectWithAsset[] = [];
  for (const row of (thesisAffectsRes.data ?? []) as AffectRow[]) {
    const mapped = mapAffect(row, assetById);
    const assetRow = assetById.get(row.asset_id);
    if (!mapped || !assetRow) continue;
    affectsWithAsset.push({ ...mapped, asset: mapAsset(assetRow) });
  }

  const clusterAffectsRes =
    clusterThesisIds.length > 0
      ? await supabase
          .from("causal_affects")
          .select(
            "id, thesis_id, asset_id, direction, strength, priced_in_percent, mispricing_score, why_it_matters, has_dedicated_thesis, thesis_slug",
          )
          .in("thesis_id", clusterThesisIds)
      : { data: [], error: null };

  if (clusterAffectsRes.error) throw clusterAffectsRes.error;

  const thesesRes =
    clusterThesisIds.length > 0
      ? await supabase
          .from("theses")
          .select(
            "id, slug, title, status, scenario_probabilities, body, thesis_score, priced_in_estimate, micro_label",
          )
          .in("id", clusterThesisIds)
      : { data: [], error: null };

  if (thesesRes.error) throw thesesRes.error;

  const affectsByThesis = new Map<string, CausalAffect[]>();
  for (const row of (clusterAffectsRes.data ?? []) as AffectRow[]) {
    const mapped = mapAffect(row, assetById);
    if (!mapped) continue;
    const list = affectsByThesis.get(row.thesis_id) ?? [];
    list.push(mapped);
    affectsByThesis.set(row.thesis_id, list);
  }

  const clusterTheses = (thesesRes.data ?? []).map((row) =>
    buildCausalThesis(row as ThesisRow, affectsByThesis.get(row.id) ?? []),
  );

  const thesis = buildCausalThesis(thesisRow, affectsWithAsset);
  const targetAsset = pickTargetAsset(thesis.targetAssetSymbol, affectsWithAsset, assetById);
  const relatedTheses = clusterTheses.filter((t) => t.id !== thesis.id);
  const impliedEffects = computeImpliedEffects(clusterTheses);

  return {
    thesis,
    rootEvent: mapEvent(event),
    targetAsset,
    affects: affectsWithAsset,
    relatedTheses,
    impliedEffects,
  };
}
