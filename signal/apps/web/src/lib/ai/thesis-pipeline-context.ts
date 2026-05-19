import type { SupabaseClient } from "@supabase/supabase-js";
import { buildGlobalCausalGraph } from "@/lib/causal-map/build-causal-graph";
import type { CausalAsset, ThesisCluster } from "@/types/causal-graph";
import type { CausalThesis } from "@/types/causal-graph";
import type { PipelineNewsItem } from "@/lib/ai/thesis-pipeline-types";

export type PipelineAsset = CausalAsset & { asset_class?: string };

export async function fetchPipelineAssets(admin: SupabaseClient): Promise<PipelineAsset[]> {
  const { data, error } = await admin.from("causal_assets").select("id, symbol, name, asset_class").order("symbol");
  if (error) throw new Error(`causal_assets:${error.message}`);
  return (data ?? []).map((row) => {
    const r = row as { id: string; symbol: string; name: string; asset_class?: string };
    return {
      id: r.id,
      symbol: r.symbol,
      name: r.name,
      asset_class: r.asset_class,
    };
  });
}

export async function fetchActiveThesesForPipeline(admin: SupabaseClient): Promise<CausalThesis[]> {
  const graph = await buildGlobalCausalGraph(admin);
  return graph.clusters.flatMap((c) => c.theses);
}

export async function fetchClustersForPipeline(admin: SupabaseClient): Promise<ThesisCluster[]> {
  const graph = await buildGlobalCausalGraph(admin);
  return graph.clusters;
}

/** Best-effort market context — extend with live quotes when available. */
export async function fetchMarketDataForPipeline(): Promise<
  Record<string, { price: number; change24h: number; volume: number }>
> {
  return {};
}

export function newsRowsToPipelineItems(
  rows: Array<{
    headline?: unknown;
    source?: unknown;
    published_at?: unknown;
    body_text?: unknown;
    one_line_summary?: unknown;
  }>,
): PipelineNewsItem[] {
  return rows
    .map((r) => {
      const headline = typeof r.headline === "string" ? r.headline.trim() : "";
      if (!headline) return null;
      const summary =
        (typeof r.one_line_summary === "string" ? r.one_line_summary : "") ||
        (typeof r.body_text === "string" ? r.body_text.slice(0, 400) : "");
      return {
        headline,
        source: typeof r.source === "string" ? r.source : "unknown",
        timestamp: typeof r.published_at === "string" ? r.published_at : new Date().toISOString(),
        summary: summary.trim() || headline,
      };
    })
    .filter((x): x is PipelineNewsItem => x !== null);
}
