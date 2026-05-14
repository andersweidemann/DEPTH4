import type { MacroEventReasoning } from "@/lib/macro-reasoning/schema";
import { isAcceptableAiThesisRegistryHero, pickAiThesisStatementFromReasoning } from "@/lib/theses/thesis-surfacing-quality";

/**
 * Structured log line for ops when `ensureAiThesisForDiscoveryCluster` rejects before insert.
 * Does not include full reasoning JSON — only field-level hints.
 */
export function diagnoseRegistryHeroFailure(args: {
  reason: string;
  titleHint: string | null;
  reasoning: MacroEventReasoning;
}): Record<string, unknown> {
  const trade = (args.reasoning.thesis_trade_line ?? "").trim();
  const summary = (args.reasoning.event_summary ?? "").trim();
  const picked = pickAiThesisStatementFromReasoning({
    titleHint: args.titleHint,
    thesisTradeLine: args.reasoning.thesis_trade_line ?? "",
    eventSummary: args.reasoning.event_summary ?? "",
  }).trim();

  const tradeOk = trade.length > 0 && isAcceptableAiThesisRegistryHero(trade);
  const summaryOk = summary.length > 0 && isAcceptableAiThesisRegistryHero(summary);

  return {
    ensure_reason: args.reason,
    thesis_trade_line_len: trade.length,
    thesis_trade_line_registry_ok: tradeOk,
    event_summary_len: summary.length,
    event_summary_registry_ok: summaryOk,
    picked_hero_len: picked.length,
    picked_empty: picked.length === 0,
    reasoning_chain_len: (args.reasoning.reasoning_chain ?? "").trim().length,
    mispricing_hypothesis_len: (args.reasoning.mispricing_hypothesis ?? "").trim().length,
  };
}
