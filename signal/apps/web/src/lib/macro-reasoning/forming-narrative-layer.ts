import type { FormingNarrativeLayer } from "@/lib/macro-reasoning/schema";

export type AiRegistryEnsureResult =
  | { ok: true; thesisId: string; created: boolean }
  | { ok: false; reason: string };

/**
 * Part C — `event_reasoning` is the forming-narrative layer (raw cluster material + model JSON).
 * Only rows that pass the DEPTH4 registry bar become `public.theses` (`ai_generated`); this object records the outcome.
 */
export function formingNarrativeLayerFromAiRegistryAttempt(
  r: AiRegistryEnsureResult | undefined,
): FormingNarrativeLayer | undefined {
  if (r === undefined) return undefined;
  if (r.ok) {
    return {
      ai_registry_evaluated: true,
      ai_registry_thesis_id: r.thesisId,
    };
  }
  return {
    ai_registry_evaluated: true,
    ai_registry_gate_reason: r.reason,
  };
}
