import type { IncentiveAnalysis } from "@/types/incentive-analysis";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function strList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => str(x)).filter(Boolean).slice(0, 12);
}

function firstStringField(o: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (Array.isArray(v) && v[0] != null) {
      const s = str(v[0]);
      if (s) return s;
    }
  }
  return "";
}

/** Parse DB JSONB or API draft `incentive_analysis` object. */
export function parseIncentiveAnalysis(raw: unknown): IncentiveAnalysis | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const actor = firstStringField(o, ["actor", "primary_actor", "key_actor", "who"]);
  const goal = firstStringField(o, ["goal", "objective", "political_goal", "economic_goal"]);
  const constraint = firstStringField(o, ["constraint", "constraints", "binding_constraint", "blocker"]);
  const required_action = firstStringField(o, [
    "required_action",
    "requiredAction",
    "required_actions",
    "must_do",
    "necessary_action",
  ]);
  const most_likely_action = firstStringField(o, [
    "most_likely_action",
    "mostLikelyAction",
    "likely_action",
    "most_likely_path",
    "base_case_action",
  ]);
  const reasoning = firstStringField(o, ["reasoning", "rationale", "analysis", "summary"]);

  if (!actor || !most_likely_action) return null;

  const goalOut = goal || reasoning.slice(0, 200) || "Achieve political and market stability on this path.";
  const requiredOut =
    required_action || most_likely_action;

  const confidenceRaw = o.confidence;
  const confidence =
    typeof confidenceRaw === "number" && Number.isFinite(confidenceRaw)
      ? Math.max(0, Math.min(100, Math.round(confidenceRaw)))
      : Number.parseInt(String(confidenceRaw ?? "0"), 10);

  return {
    actor,
    goal: goalOut,
    constraint: constraint || "—",
    required_action: requiredOut,
    alternative_actions: strList(
      o.alternative_actions ?? o.alternativeActions ?? o.alternative_paths ?? o.alternatives,
    ),
    most_likely_action,
    confidence: Number.isFinite(confidence) ? confidence : 0,
    time_window: firstStringField(o, ["time_window", "timeWindow", "time_horizon", "horizon"]) || "—",
    catalyst_events: strList(o.catalyst_events ?? o.catalystEvents ?? o.catalysts ?? o.watch_items),
    reasoning: reasoning || goalOut,
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
