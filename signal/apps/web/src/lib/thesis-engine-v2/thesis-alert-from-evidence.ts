/**
 * Builds thesis bell alerts from `thesis_evidence_log`-shaped rows. Logic mirrors
 * `thesis-live-context` evidence polling so replay + live pushes stay consistent.
 */
import type { ThesisAlertImpact } from "@/lib/thesis-engine-v2/thesis-alert-types";
import { displayLabelForDbScenarioKey } from "@/lib/thesis-engine-v2/thesis-scenarios-normalize";
import { isFreshEvidenceAlertEligible } from "@/lib/thesis-engine-v2/thesis-evidence-poll-scope";

export type NotifyPrefForAlert = "any" | "major" | "consequence" | "mute";

export type ThesisEvidenceRowForAlert = {
  id: string;
  createdAt: number;
  thesisId: string;
  eventType: string;
  description: string;
  probabilityBefore: { base: number; bull: number; bear: number } | null;
  probabilityAfter: { base: number; bull: number; bear: number } | null;
  metadata: Record<string, unknown> | undefined;
};

/** Stable id for alerts derived from `thesis_evidence_log.id` (survives relogin). */
export function evidenceLogRowStableAlertId(logRowId: string): string {
  return `evidence:${logRowId.trim()}`;
}

/** Stable id for manual resolve/invalidated alerts (outcome `at` is ISO from account). */
export function manualOutcomeStableAlertId(thesisId: string, outcomeAtIso: string): string {
  return `manual-outcome:${thesisId.trim()}:${outcomeAtIso.trim()}`;
}

export type PendingThesisAlert = {
  id: string;
  thesisId: string;
  thesisTitle: string;
  type: "probability_change" | "consequence_change" | "invalidation" | "system";
  scenario?: "base" | "bull" | "bear";
  oldProbability?: number;
  newProbability?: number;
  confirmText: string;
  consequenceText: string;
  impact: ThesisAlertImpact;
};

function leadScenarioOf(p: { base: number; bull: number; bear: number }) {
  return (["base", "bull", "bear"] as const).reduce((best, k) => (p[k] > p[best] ? k : best), "base");
}

export function buildThesisAlertFromEvidenceRow(
  r: ThesisEvidenceRowForAlert,
  ctx: {
    starred: Set<string>;
    openIds: Set<string>;
    userPollIds: Set<string>;
    prefs: Record<string, NotifyPrefForAlert>;
    titleForThesisId: (thesisId: string) => string;
  },
): PendingThesisAlert | null {
  if (
    !isFreshEvidenceAlertEligible({
      thesisId: r.thesisId,
      starred: ctx.starred,
      openIds: ctx.openIds,
      userPollIds: ctx.userPollIds,
    })
  ) {
    return null;
  }

  const pref = ctx.prefs[r.thesisId] ?? "major";
  if (pref === "mute") return null;

  const title = ctx.titleForThesisId(r.thesisId);
  const signalLevel = typeof r.metadata?.signal_level === "number" ? r.metadata.signal_level : 0;
  const stableId = evidenceLogRowStableAlertId(r.id);

  const insiderEvt =
    r.eventType === "insider_flow" ||
    r.eventType === "insider_flow_confirmed" ||
    r.eventType === "insider_flow_invalidated";

  if (insiderEvt) {
    let notify = pref === "any" || pref === "major";
    if (pref === "consequence") notify = r.eventType === "insider_flow_invalidated";
    if (!notify) return null;

    const kind =
      r.eventType === "insider_flow"
        ? "Unusual flow detected"
        : r.eventType === "insider_flow_confirmed"
          ? "Flow confirmed by headline"
          : "Flow invalidated";

    return {
      id: stableId,
      thesisId: r.thesisId,
      thesisTitle: title,
      type: "system",
      confirmText: `${kind} — ${r.description || "Insider Flow update"}`,
      consequenceText:
        "Check the thesis or Insider Flow radar for tape + tags. Pro: enable web push in the radar panel for alerts when this tab is closed.",
      impact:
        r.eventType === "insider_flow_invalidated"
          ? "major_negative"
          : r.eventType === "insider_flow_confirmed"
            ? "major_positive"
            : "neutral",
    };
  }

  if (r.probabilityBefore && r.probabilityAfter) {
    const before = r.probabilityBefore;
    const after = r.probabilityAfter;
    const deltas: Array<{ k: "base" | "bull" | "bear"; d: number }> = (["base", "bull", "bear"] as const).map((k) => ({
      k,
      d: after[k] - before[k],
    }));
    deltas.sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
    const top = deltas[0]!;
    const oldLead = leadScenarioOf(before);
    const newLead = leadScenarioOf(after);
    const leadChanged = oldLead !== newLead;
    const bigMove = Math.abs(top.d) >= 5;
    const scenarioLabel = leadChanged ? newLead : top.k;
    const oldP = before[scenarioLabel];
    const newP = after[scenarioLabel];

    const should =
      pref === "any"
        ? Math.abs(top.d) >= 2 || leadChanged
        : pref === "consequence"
          ? leadChanged && newLead === "bear"
          : bigMove || leadChanged;

    if (!should) return null;

    const consequenceText =
      scenarioLabel === "bull"
        ? "Conviction tilts toward this thesis paying roughly on plan — still size and trail per Trade plan; do not invent a new entry here."
        : scenarioLabel === "bear"
          ? "Conviction tilts toward invalidation — follow Invalidation and Book; trim or retire the line per your rules."
          : "Same thesis, choppier path — keep size cautious until drivers line up cleanly.";

    return {
      id: stableId,
      thesisId: r.thesisId,
      thesisTitle: title,
      type: "probability_change",
      scenario: scenarioLabel,
      oldProbability: oldP,
      newProbability: newP,
      confirmText: `${displayLabelForDbScenarioKey(scenarioLabel)} ${oldP}% → ${newP}%`,
      consequenceText: `Consequence: ${consequenceText}`,
      impact: scenarioLabel === "bear" ? "major_negative" : scenarioLabel === "bull" ? "major_positive" : "neutral",
    };
  }

  const should = pref === "any" || (pref === "major" && signalLevel >= 4);
  if (!should) return null;

  return {
    id: stableId,
    thesisId: r.thesisId,
    thesisTitle: title,
    type: "system",
    confirmText: r.description || "Evidence update",
    consequenceText: r.eventType ? `Type: ${r.eventType}` : "",
    impact: "neutral",
  };
}
