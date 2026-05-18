import type { IncentiveAnalysis } from "@/types/incentive-analysis";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function strList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => str(x)).filter(Boolean).slice(0, 12);
}

/** Parse DB JSONB or API draft `incentive_analysis` object. */
export function parseIncentiveAnalysis(raw: unknown): IncentiveAnalysis | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const actor = str(o.actor);
  const goal = str(o.goal);
  const constraint = str(o.constraint);
  const required_action = str(o.required_action ?? o.requiredAction);
  const most_likely_action = str(o.most_likely_action ?? o.mostLikelyAction);
  if (!actor || !goal || !required_action || !most_likely_action) return null;

  const confidenceRaw = o.confidence;
  const confidence =
    typeof confidenceRaw === "number" && Number.isFinite(confidenceRaw)
      ? Math.max(0, Math.min(100, Math.round(confidenceRaw)))
      : Number.parseInt(String(confidenceRaw ?? "0"), 10);

  return {
    actor,
    goal,
    constraint: constraint || "—",
    required_action,
    alternative_actions: strList(o.alternative_actions ?? o.alternativeActions),
    most_likely_action,
    confidence: Number.isFinite(confidence) ? confidence : 0,
    time_window: str(o.time_window ?? o.timeWindow) || "—",
    catalyst_events: strList(o.catalyst_events ?? o.catalystEvents),
    reasoning: str(o.reasoning),
  };
}

export function incentiveAnalysisToDbJson(analysis: IncentiveAnalysis): Record<string, unknown> {
  return {
    actor: analysis.actor,
    goal: analysis.goal,
    constraint: analysis.constraint,
    required_action: analysis.required_action,
    alternative_actions: analysis.alternative_actions,
    most_likely_action: analysis.most_likely_action,
    confidence: analysis.confidence,
    time_window: analysis.time_window,
    catalyst_events: analysis.catalyst_events,
    reasoning: analysis.reasoning,
  };
}
