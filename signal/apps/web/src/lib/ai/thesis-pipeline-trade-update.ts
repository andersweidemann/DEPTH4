import type { SupabaseClient } from "@supabase/supabase-js";
import type { PipelineLlmClient } from "@/lib/ai/thesis-pipeline-llm";
import { isPlaceholderTradeLevel } from "@/lib/ai/thesis-pipeline-body";
import type { ContinuousNewsItem } from "@/lib/ai/thesis-pipeline-continuous";
import { logPipelineStage } from "@/lib/ai/thesis-pipeline";
import { systemUpdateThesis } from "@/lib/thesis-mutation";

type TradePlanPatch = {
  entry_zone: string;
  stop: string;
  target1: string;
  target2?: string | null;
};

function readTradePlan(body: Record<string, unknown>): TradePlanPatch | null {
  const tp = body.tradePlan ?? body.trade_plan;
  if (!tp || typeof tp !== "object" || Array.isArray(tp)) return null;
  const row = tp as Record<string, unknown>;
  const entry_zone = String(row.entry_zone ?? row.entryZone ?? "").trim();
  const stop = String(row.stop ?? "").trim();
  const target1 = String(row.target1 ?? "").trim();
  if (isPlaceholderTradeLevel(entry_zone) || isPlaceholderTradeLevel(stop) || isPlaceholderTradeLevel(target1)) {
    return null;
  }
  const target2 = String(row.target2 ?? "").trim();
  return {
    entry_zone,
    stop,
    target1,
    target2: target2 && !isPlaceholderTradeLevel(target2) ? target2 : null,
  };
}

function parseTradeLevelPatch(raw: unknown): {
  update_needed: boolean;
  entry_zone?: string;
  stop?: string;
  target1?: string;
  target2?: string | null;
  reasoning?: string;
} | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    update_needed: o.update_needed === true,
    entry_zone: typeof o.entry_zone === "string" ? o.entry_zone.trim() : undefined,
    stop: typeof o.stop === "string" ? o.stop.trim() : undefined,
    target1: typeof o.target1 === "string" ? o.target1.trim() : undefined,
    target2: typeof o.target2 === "string" ? o.target2.trim() : o.target2 === null ? null : undefined,
    reasoning: typeof o.reasoning === "string" ? o.reasoning.trim() : undefined,
  };
}

/** Re-evaluate entry/stop/targets when new evidence hits a live thesis. */
export async function updateTradeLevelsFromNews(
  admin: SupabaseClient,
  thesisId: string,
  thesisSlug: string,
  thesisTitle: string,
  targetSymbol: string,
  direction: string,
  body: Record<string, unknown>,
  newsItem: ContinuousNewsItem,
  llm: PipelineLlmClient,
): Promise<{ updated: boolean }> {
  const current = readTradePlan(body);
  if (!current) return { updated: false };

  const prompt = [
    `Thesis: "${thesisTitle}" — ${direction.toUpperCase()} ${targetSymbol}`,
    `Current levels: Entry ${current.entry_zone}, Stop ${current.stop}, Target ${current.target1}`,
    "",
    `New evidence: [${newsItem.source}] ${newsItem.headline}`,
    "",
    "Should trade levels be adjusted? Consider:",
    "- If evidence CONFIRMS thesis: tighten stop (reduce risk), keep or raise target",
    "- If evidence WEAKENS thesis: widen stop or reduce position size",
    "- If price has moved significantly: adjust entry to current zone",
    "",
    'Output JSON only: {"update_needed":true|false,"entry_zone":"...","stop":"...","target1":"...","target2":"...","reasoning":"..."}',
  ].join("\n");

  const raw = await llm.completeJson(prompt, 400);
  const result = parseTradeLevelPatch(raw);
  if (!result?.update_needed) return { updated: false };

  const next: TradePlanPatch = {
    entry_zone: result.entry_zone && !isPlaceholderTradeLevel(result.entry_zone) ? result.entry_zone : current.entry_zone,
    stop: result.stop && !isPlaceholderTradeLevel(result.stop) ? result.stop : current.stop,
    target1: result.target1 && !isPlaceholderTradeLevel(result.target1) ? result.target1 : current.target1,
    target2: result.target2 !== undefined ? result.target2 : current.target2 ?? null,
  };

  const changed =
    next.entry_zone !== current.entry_zone ||
    next.stop !== current.stop ||
    next.target1 !== current.target1 ||
    (next.target2 ?? "") !== (current.target2 ?? "");

  if (!changed) return { updated: false };

  const mergedBody = {
    ...body,
    tradePlan: {
      ...(typeof body.tradePlan === "object" && body.tradePlan && !Array.isArray(body.tradePlan)
        ? (body.tradePlan as Record<string, unknown>)
        : {}),
      ...next,
    },
    entry_zone: next.entry_zone,
    stop: next.stop,
    target1: next.target1,
    target2: next.target2,
    trade: `Entry ${next.entry_zone}; stop ${next.stop}; targets ${next.target1}${next.target2 ? ` / ${next.target2}` : ""}.`,
  };

  const upd = await systemUpdateThesis(
    admin,
    thesisId,
    { body: mergedBody, updated_at: new Date().toISOString() } as never,
    {
      actorType: "news",
      reason: result.reasoning ?? "Trade plan adjusted on new evidence",
      changeType: "field_update",
      metadata: {
        source: "trade_plan_adjustment",
        headline: newsItem.headline,
        prior_stop: current.stop,
        new_stop: next.stop,
      },
    },
  );

  if (!upd.ok) return { updated: false };

  await admin.from("thesis_updates").insert({
    thesis_id: thesisId,
    actor_type: "news",
    change_type: "trade_plan_adjustment",
    reason: `Stop ${current.stop} → ${next.stop}. ${result.reasoning ?? "Levels updated on new evidence."}`,
    metadata: { slug: thesisSlug, news_headline: newsItem.headline, prior: current, next },
  });

  logPipelineStage("trade_plan_adjusted", { thesis_id: thesisId, stop: next.stop });
  return { updated: true };
}
