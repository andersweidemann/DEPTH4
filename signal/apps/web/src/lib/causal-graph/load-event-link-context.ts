import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildCausalThesis,
  mapEvent,
  type EventRow,
  type ThesisRow,
} from "@/lib/causal-map/build-causal-graph";
import type { CausalEvent, CausalThesis } from "@/types/causal-graph";

export type EventLinkContext = {
  event: CausalEvent;
  clusterTheses: CausalThesis[];
};

export async function loadEventLinkContext(
  admin: SupabaseClient,
  eventId: string,
  excludeThesisId?: string,
): Promise<EventLinkContext | null> {
  const { data: eventRow, error: eventErr } = await admin
    .from("causal_events")
    .select("id, slug, title, description, category, status, confidence, first_detected, last_updated")
    .eq("id", eventId)
    .maybeSingle();

  if (eventErr || !eventRow) return null;

  const { data: links } = await admin.from("event_thesis_links").select("thesis_id").eq("event_id", eventId);

  const thesisIds = (links ?? [])
    .map((l) => String((l as { thesis_id: string }).thesis_id))
    .filter((id) => id && id !== excludeThesisId);

  let clusterTheses: CausalThesis[] = [];
  if (thesisIds.length > 0) {
    const { data: thesisRows } = await admin
      .from("theses")
      .select("id, slug, title, status, scenario_probabilities, body, thesis_score, priced_in_estimate, micro_label")
      .in("id", thesisIds);

    clusterTheses = (thesisRows ?? []).map((row) => buildCausalThesis(row as ThesisRow, []));
  }

  return {
    event: mapEvent(eventRow as EventRow),
    clusterTheses,
  };
}

export async function resolveEventId(
  admin: SupabaseClient,
  input: { eventId?: string; eventSlug?: string },
): Promise<string | null> {
  const id = input.eventId?.trim();
  if (id) return id;

  const slug = input.eventSlug?.trim();
  if (!slug) return null;

  const { data } = await admin.from("causal_events").select("id").eq("slug", slug).maybeSingle();
  return data?.id ? String(data.id) : null;
}
