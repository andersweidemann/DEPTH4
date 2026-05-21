import type { ThesisAlertImpact } from "@/lib/thesis-engine-v2/thesis-alert-types";
import { displayLabelForDbScenarioKey } from "@/lib/thesis-engine-v2/thesis-scenarios-normalize";
import {
  NEW_THESIS_NOTIFICATION_KIND,
  newThesisNotificationAlertKey,
  remodelNotificationAlertKey,
} from "@/lib/thesis/remodel-notifications";
import type { PendingThesisAlert } from "@/lib/thesis-engine-v2/thesis-alert-from-evidence";

export type Depth4NotificationRow = {
  id: string;
  created_at: string;
  thesis_id: string;
  kind?: string;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  read_at: string | null;
  dismissed_at: string | null;
};

function parseTriple(raw: unknown): { base: number; bull: number; bear: number } | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const base = Number(o.base);
  const bull = Number(o.bull);
  const bear = Number(o.bear);
  if (![base, bull, bear].every((n) => Number.isFinite(n))) return null;
  return { base: Math.round(base), bull: Math.round(bull), bear: Math.round(bear) };
}

function leadScenarioOf(p: { base: number; bull: number; bear: number }) {
  return (["base", "bull", "bear"] as const).reduce((best, k) => (p[k] > p[best] ? k : best), "base");
}

export function buildThesisAlertFromRemodelNotification(row: Depth4NotificationRow): PendingThesisAlert {
  const meta = row.metadata ?? {};
  const kind = String(row.kind ?? "").trim();

  if (kind === NEW_THESIS_NOTIFICATION_KIND) {
    const slug = String(meta.thesis_slug ?? "").trim();
    const asset = String(meta.asset_symbol ?? "").trim();
    return {
      id: newThesisNotificationAlertKey(row.id),
      thesisId: row.thesis_id,
      thesisTitle: row.title.replace(/^New thesis:\s*/i, "").trim() || row.title,
      type: "system",
      confirmText: row.title,
      consequenceText: row.body.trim()
        ? `Consequence: ${row.body.trim()}`
        : slug
          ? `Consequence: New research thesis mapped${asset ? ` on ${asset}` : ""}.`
          : "Consequence: DEPTH4 mapped a new macro research thesis.",
      impact: "neutral",
    };
  }

  const before = parseTriple(meta.scenario_probabilities_before);
  const after = parseTriple(meta.scenario_probabilities_after);

  let scenario: "base" | "bull" | "bear" | undefined;
  let oldProbability: number | undefined;
  let newProbability: number | undefined;
  let confirmText = row.title;
  let impact: ThesisAlertImpact = "neutral";

  if (before && after) {
    const deltas = (["base", "bull", "bear"] as const).map((k) => ({
      k,
      d: after[k] - before[k],
    }));
    deltas.sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
    const top = deltas[0]!;
    const oldLead = leadScenarioOf(before);
    const newLead = leadScenarioOf(after);
    const scenarioLabel = oldLead !== newLead ? newLead : top.k;
    scenario = scenarioLabel;
    oldProbability = before[scenarioLabel];
    newProbability = after[scenarioLabel];
    confirmText = `${displayLabelForDbScenarioKey(scenarioLabel)} ${oldProbability}% → ${newProbability}%`;
    impact =
      scenarioLabel === "bear"
        ? "major_negative"
        : scenarioLabel === "bull"
          ? "major_positive"
          : Math.abs(top.d) >= 5
            ? "minor_positive"
            : "neutral";
  }

  const body = row.body.trim();
  const consequenceText = body
    ? body.startsWith("Consequence:")
      ? body
      : `Consequence: ${body}`
    : "Trade plan and branch odds were refreshed after new evidence.";

  return {
    id: remodelNotificationAlertKey(row.id),
    thesisId: row.thesis_id,
    thesisTitle: row.title,
    type: "probability_change",
    scenario,
    oldProbability,
    newProbability,
    confirmText,
    consequenceText,
    impact,
  };
}
