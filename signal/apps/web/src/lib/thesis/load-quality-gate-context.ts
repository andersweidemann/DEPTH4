import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildCausalThesis,
  mapAffect,
  type AffectRow,
  type ThesisRow,
} from "@/lib/causal-map/build-causal-graph";
import type { ThesisCluster } from "@/types/causal-graph";
import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { mergeDbBodyIntoThesis } from "@/lib/thesis-engine-v2/thesis-db-body";
import { getThesisDetail } from "@/lib/thesis-engine-v2/catalog-data";
import { parseIncentiveAnalysis } from "@/lib/thesis/incentive-analysis";
import {
  qualityGateInputFromCausalThesis,
  runQualityGate,
  type QualityGateInput,
  type QualityReport,
} from "@/lib/thesis/quality-gate";

export async function loadQualityGateContext(
  supabase: SupabaseClient,
  thesisId: string,
): Promise<{
  input: QualityGateInput;
  cluster: ThesisCluster | null;
  peers: QualityGateInput[];
} | null> {
  const { data: row, error } = await supabase
    .from("theses")
    .select(
      "id, slug, title, status, scenario_probabilities, body, thesis_score, priced_in_estimate, micro_label, incentive_analysis",
    )
    .eq("id", thesisId)
    .maybeSingle();

  if (error || !row) return null;

  const thesisRow = row as ThesisRow;
  const slug = thesisRow.slug?.trim() || thesisRow.id;

  const [{ data: affectRows }, { data: linkRows }] = await Promise.all([
    supabase
      .from("causal_affects")
      .select(
        "id, thesis_id, asset_id, direction, strength, priced_in_percent, mispricing_score, why_it_matters, has_dedicated_thesis, thesis_slug, time_depth, asset_depth",
      )
      .eq("thesis_id", thesisId),
    supabase.from("event_thesis_links").select("event_id, thesis_id, is_primary").eq("thesis_id", thesisId),
  ]);

  const { data: assets } = await supabase.from("causal_assets").select("id, symbol, name");
  const assetById = new Map((assets ?? []).map((a) => [a.id as string, a as { id: string; symbol: string; name: string }]));

  const affects = (affectRows ?? [])
    .map((r) => mapAffect(r as AffectRow, assetById))
    .filter((a): a is NonNullable<typeof a> => !!a);

  const causal = buildCausalThesis(thesisRow, affects);
  const incentive = parseIncentiveAnalysis((row as { incentive_analysis?: unknown }).incentive_analysis);

  let engine: Thesis | null = slug ? getThesisDetail(slug)?.thesis ?? null : null;
  if (engine && thesisRow.body) {
    engine = mergeDbBodyIntoThesis(engine, thesisRow.body);
  }

  const input = qualityGateInputFromCausalThesis(causal, {
    incentive_analysis: incentive ?? causal.incentive_analysis,
    entryZone: engine?.entryZone,
    stop: engine?.stop,
    target1: engine?.target1,
  });

  let cluster: ThesisCluster | null = null;
  const peers: QualityGateInput[] = [];
  const eventId = linkRows?.[0]?.event_id as string | undefined;

  if (eventId) {
    const { data: event } = await supabase.from("causal_events").select("*").eq("id", eventId).maybeSingle();
    const { data: clusterLinks } = await supabase
      .from("event_thesis_links")
      .select("thesis_id")
      .eq("event_id", eventId);

    const peerIds = (clusterLinks ?? [])
      .map((l) => (l as { thesis_id: string }).thesis_id)
      .filter((id) => id !== thesisId);

    if (event && peerIds.length > 0) {
      const { data: peerRows } = await supabase
        .from("theses")
        .select("id, slug, title, status, scenario_probabilities, body, thesis_score, priced_in_estimate, micro_label")
        .in("id", peerIds);

      const { data: peerAffects } = await supabase
        .from("causal_affects")
        .select(
          "id, thesis_id, asset_id, direction, strength, priced_in_percent, mispricing_score, why_it_matters, has_dedicated_thesis, thesis_slug, time_depth, asset_depth",
        )
        .in("thesis_id", peerIds);

      const affectsByThesis = new Map<string, typeof affects>();
      for (const ar of peerAffects ?? []) {
        const mapped = mapAffect(ar as AffectRow, assetById);
        if (!mapped) continue;
        const tid = (ar as AffectRow).thesis_id;
        const list = affectsByThesis.get(tid) ?? [];
        list.push(mapped);
        affectsByThesis.set(tid, list);
      }

      const clusterTheses = (peerRows ?? []).map((pr) =>
        buildCausalThesis(pr as ThesisRow, affectsByThesis.get((pr as ThesisRow).id) ?? []),
      );
      clusterTheses.push(causal);

      cluster = {
        event: {
          id: event.id as string,
          slug: event.slug as string,
          title: event.title as string,
          description: (event.description as string) ?? "",
          category: event.category as ThesisCluster["event"]["category"],
          status: "active",
          confidence: event.confidence as number,
          firstDetected: event.first_detected as string,
          lastUpdated: event.last_updated as string | undefined,
        },
        theses: clusterTheses,
        impliedEffects: [],
        compositeMispricing: 0,
        conflictWarnings: [],
      };

      for (const t of clusterTheses) {
        if (t.slug === input.slug) continue;
        peers.push(qualityGateInputFromCausalThesis(t));
      }
    }
  }

  return { input, cluster, peers };
}

export async function runQualityGateForThesisId(
  supabase: SupabaseClient,
  thesisId: string,
): Promise<QualityReport | null> {
  const ctx = await loadQualityGateContext(supabase, thesisId);
  if (!ctx) return null;
  return runQualityGate(ctx.input, ctx.cluster, ctx.peers);
}
