import type { SupabaseClient } from "@supabase/supabase-js";
import { validateThesisEventLink } from "@/lib/causal-graph/causal-validator";
import {
  buildCausalThesis,
  mapEvent,
  type EventRow,
  type ThesisRow,
} from "@/lib/causal-map/build-causal-graph";
import { sameTargetAsset } from "@/lib/causal-graph/causal-validator";
import type { CausalThesis } from "@/types/causal-graph";

export type ConflictSeverity = "critical" | "warning";

export interface ConflictReport {
  eventId: string;
  eventTitle: string;
  severity: ConflictSeverity;
  theses: string[];
  message: string;
  recommendation: string;
  rule: "same_asset_opposite_direction" | "semantic_validation";
}

function groupByEventId<T extends { event_id: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const list = map.get(row.event_id) ?? [];
    list.push(row);
    map.set(row.event_id, list);
  }
  return map;
}

export async function scanForContradictions(supabase: SupabaseClient): Promise<ConflictReport[]> {
  const { data: links, error: linkErr } = await supabase
    .from("event_thesis_links")
    .select("event_id, thesis_id")
    .order("event_id");

  if (linkErr || !links?.length) return [];

  const eventIds = Array.from(new Set(links.map((l) => String(l.event_id))));
  const thesisIds = Array.from(new Set(links.map((l) => String(l.thesis_id))));

  const [{ data: events }, { data: theses }] = await Promise.all([
    supabase
      .from("causal_events")
      .select("id, slug, title, description, category, status, confidence, first_detected, last_updated")
      .in("id", eventIds),
    supabase
      .from("theses")
      .select("id, slug, title, status, scenario_probabilities, body, thesis_score, priced_in_estimate, micro_label")
      .in("id", thesisIds),
  ]);

  const eventById = new Map((events ?? []).map((e) => [String(e.id), e as EventRow]));
  const thesisById = new Map((theses ?? []).map((t) => [String(t.id), buildCausalThesis(t as ThesisRow, [])]));

  const reports: ConflictReport[] = [];
  const byEvent = groupByEventId(links as { event_id: string; thesis_id: string }[]);

  for (const [eventId, eventLinks] of Array.from(byEvent.entries())) {
    const eventRow = eventById.get(eventId);
    if (!eventRow) continue;

    const event = mapEvent(eventRow);
    const clusterTheses: CausalThesis[] = eventLinks
      .map((l) => thesisById.get(String(l.thesis_id)))
      .filter((t): t is CausalThesis => Boolean(t));

    for (let i = 0; i < clusterTheses.length; i++) {
      for (let j = i + 1; j < clusterTheses.length; j++) {
        const a = clusterTheses[i]!;
        const b = clusterTheses[j]!;
        if (sameTargetAsset(a.targetAssetSymbol, b.targetAssetSymbol) && a.direction !== b.direction) {
          reports.push({
            eventId,
            eventTitle: event.title,
            severity: "critical",
            theses: [a.slug, b.slug],
            message: `${a.title} (${a.direction}) contradicts ${b.title} (${b.direction}) on ${a.targetAssetSymbol}`,
            recommendation: "Move one thesis to a different event, or resolve the contradiction",
            rule: "same_asset_opposite_direction",
          });
        }
      }
    }

    for (const thesis of clusterTheses) {
      const others = clusterTheses.filter((t) => t.slug !== thesis.slug);
      const validation = validateThesisEventLink(thesis, event, others);
      for (const err of validation.errors) {
        reports.push({
          eventId,
          eventTitle: event.title,
          severity: "critical",
          theses: [thesis.slug],
          message: err,
          recommendation: "Relink thesis to a matching event or revise thesis direction/claims",
          rule: "semantic_validation",
        });
      }
      for (const warn of validation.warnings) {
        reports.push({
          eventId,
          eventTitle: event.title,
          severity: "warning",
          theses: [thesis.slug],
          message: warn,
          recommendation: "Review event assignment and thesis wording",
          rule: "semantic_validation",
        });
      }
    }
  }

  return reports;
}
