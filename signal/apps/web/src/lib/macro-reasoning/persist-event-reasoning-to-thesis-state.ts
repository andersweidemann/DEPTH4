import type { SupabaseClient } from "@supabase/supabase-js";
import type { MacroEventReasoning } from "@/lib/macro-reasoning/schema";
import { dbScenarioTripleFromMacroHeadlineLeadPct } from "@/lib/macro-reasoning/macro-headline-probability-to-db-triple";

export type PersistEventReasoningToThesisStateParams = {
  reasoning: MacroEventReasoning;
  eventReasoningRowId: string;
  anchorNewsEventId: string;
  clusterId: string;
};

/**
 * After `event_reasoning` insert: align thesis engine canonical state with the same headline
 * `probability_*_pct` values the feed shows (`CompactScanConfidenceProb`).
 *
 * Writes:
 * - `thesis_evidence_log` — `probability_before` / `probability_after` JSON triples (client bootstrap + timeline)
 * - `public.theses.scenario_probabilities` — headline-aligned triple (SSR + DB truth)
 */
export async function persistEventReasoningToThesisState(
  admin: SupabaseClient,
  p: PersistEventReasoningToThesisStateParams,
): Promise<{ ok: true; thesisId: string } | { ok: false; reason: string }> {
  const thesisId = (p.reasoning.affected_theses[0] ?? "").trim();
  if (!thesisId) return { ok: false, reason: "no_primary_affected_thesis" };

  const pa = p.reasoning.probability_after_pct;
  if (pa == null) return { ok: false, reason: "no_probability_after_pct" };
  if (pa <= 0) return { ok: false, reason: "non_positive_probability_after_pct" };

  const afterTriple = dbScenarioTripleFromMacroHeadlineLeadPct(pa);
  const pb = p.reasoning.probability_before_pct;
  const beforeTriple = pb != null ? dbScenarioTripleFromMacroHeadlineLeadPct(pb) : null;

  const headline = (p.reasoning.event_summary ?? "").trim().slice(0, 480);
  const description = headline ? `Promoted cluster · ${headline}` : "Promoted cluster · macro event reasoning";

  const dedupeKey = `macro_event_reasoning:${p.clusterId}:${thesisId}:${p.eventReasoningRowId}`;

  const { error: evErr } = await admin.from("thesis_evidence_log").insert({
    thesis_id: thesisId,
    event_type: "MACRO_EVENT_REASONING",
    description,
    probability_before: beforeTriple,
    probability_after: afterTriple,
    metadata: {
      source: "event_reasoning",
      cluster_id: p.clusterId,
      news_event_id: p.anchorNewsEventId,
      event_reasoning_id: p.eventReasoningRowId,
      probability_before_pct: pb,
      probability_after_pct: pa,
    },
    dedupe_key: dedupeKey,
  } as never);

  if (evErr) {
    console.warn("[event-reasoning] thesis_evidence_log insert failed", { message: evErr.message, thesisId });
  }

  const { error: thErr } = await admin
    .from("theses")
    .update({ scenario_probabilities: afterTriple, updated_at: new Date().toISOString() })
    .eq("id", thesisId);

  if (thErr) {
    console.warn("[event-reasoning] theses scenario_probabilities update failed", { message: thErr.message, thesisId });
  }

  return { ok: true, thesisId };
}
