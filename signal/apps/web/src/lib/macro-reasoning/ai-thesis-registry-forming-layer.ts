import type { FormingNarrativeLayer, MacroEventReasoning } from "@/lib/macro-reasoning/schema";
import { validateMacroReasoningBeforeThesisInsert } from "@/lib/theses/ai-registry-depth4-pack";
import { pickAiThesisStatementFromReasoning } from "@/lib/theses/thesis-surfacing-quality";

type EnsureOutcome = { ok: true; thesisId: string; created: boolean } | { ok: false; reason: string };

/**
 * Records Part C split: whether this cluster’s model output cleared the DEPTH4 bar for `public.theses`, and the
 * outcome of {@link ensureAiThesisForDiscoveryCluster} (single upsert attempt per cron run).
 * Stored on `event_reasoning.reasoning` by the cron worker (not emitted by the LLM).
 */
export function buildFormingNarrativeLayerForRegistry(args: {
  titleHint: string | null;
  reasoning: MacroEventReasoning;
  ensureResult: EnsureOutcome;
}): FormingNarrativeLayer {
  const hero = pickAiThesisStatementFromReasoning({
    titleHint: args.titleHint,
    thesisTradeLine: args.reasoning.thesis_trade_line ?? "",
    eventSummary: args.reasoning.event_summary ?? "",
  }).trim();

  if (!hero) {
    return { ai_registry_evaluated: false };
  }

  const gate = validateMacroReasoningBeforeThesisInsert({ hero, reasoning: args.reasoning });
  if (!gate.ok) {
    return {
      ai_registry_evaluated: true,
      ai_registry_gate_reason: gate.reason,
    };
  }

  if (!args.ensureResult.ok) {
    return {
      ai_registry_evaluated: true,
      ai_registry_gate_reason: args.ensureResult.reason,
    };
  }

  return {
    ai_registry_evaluated: true,
    ai_registry_thesis_id: args.ensureResult.thesisId,
  };
}
