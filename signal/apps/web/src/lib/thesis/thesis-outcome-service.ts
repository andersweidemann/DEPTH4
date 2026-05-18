import type { SupabaseClient } from "@supabase/supabase-js";
import { parseScenarioProbabilities } from "@/lib/thesis-engine-v2/catalog-thesis-titles-server";
import { thesisConvictionPctFromDbTriple } from "@/lib/thesis-engine-v2/thesis-display-scenarios";
import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { generateReflection } from "@/lib/thesis/reflection-generator";
import { mapOutcomeRow, type ThesisOutcomeRow } from "@/lib/thesis/thesis-outcome-db";
import { buildTrackRecord } from "@/lib/thesis/track-record";
import type { MarketDirection, ThesisOutcomeKind, ThesisOutcomeRecord } from "@/types/thesis-outcome";
import { RESOLVABLE_OUTCOMES } from "@/types/thesis-outcome";

export type ResolveThesisInput = {
  outcome: ThesisOutcomeKind;
  resolvedPrice?: number;
  catalyst?: string;
  pnl?: number;
  resolvedBy?: "manual" | "auto" | "system";
};

function predictedDirection(thesis: Thesis): "up" | "down" {
  if (thesis.direction === "long") return "up";
  if (thesis.direction === "short") return "down";
  return "down";
}

function actualDirectionForOutcome(
  outcome: ThesisOutcomeKind,
  predicted: "up" | "down",
): MarketDirection | null {
  if (outcome === "won_clean" || outcome === "won_messy") return predicted;
  if (outcome === "failed") return predicted === "up" ? "down" : "up";
  if (outcome === "expired") return "neutral";
  return null;
}

function convictionFromThesis(thesis: Thesis, scenarioRaw: unknown): number {
  const triple = parseScenarioProbabilities(scenarioRaw);
  if (triple) return thesisConvictionPctFromDbTriple(triple);
  return Math.round(thesis.probability);
}

async function fetchThesisDbRow(
  sb: SupabaseClient,
  thesisId: string,
): Promise<{ created_at: string; scenario_probabilities: unknown } | null> {
  const { data, error } = await sb
    .from("theses")
    .select("created_at, scenario_probabilities")
    .eq("id", thesisId)
    .maybeSingle();
  if (error || !data) return null;
  return data as { created_at: string; scenario_probabilities: unknown };
}

function holdDurationDays(createdAt: string): number | null {
  const t = Date.parse(createdAt);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

function validateResolvableOutcome(outcome: string): outcome is (typeof RESOLVABLE_OUTCOMES)[number] {
  return (RESOLVABLE_OUTCOMES as readonly string[]).includes(outcome);
}

export async function getOutcomeForThesis(
  sb: SupabaseClient,
  thesisId: string,
): Promise<ThesisOutcomeRecord | null> {
  const { data, error } = await sb
    .from("thesis_outcomes")
    .select("*")
    .eq("thesis_id", thesisId)
    .order("resolved_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return mapOutcomeRow(data as ThesisOutcomeRow);
}

export async function getOutcomeForSlug(
  sb: SupabaseClient,
  slug: string,
): Promise<ThesisOutcomeRecord | null> {
  const { data, error } = await sb
    .from("thesis_outcomes")
    .select("*")
    .eq("thesis_slug", slug)
    .order("resolved_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return mapOutcomeRow(data as ThesisOutcomeRow);
}

async function insertOutcomeAndUpdateThesis(
  sb: SupabaseClient,
  thesis: Thesis,
  slug: string,
  input: ResolveThesisInput,
  status: "resolved" | "invalidated",
): Promise<ThesisOutcomeRecord> {
  const dbRow = await fetchThesisDbRow(sb, thesis.id);
  const createdAt = dbRow?.created_at ?? new Date().toISOString();
  const pred = predictedDirection(thesis);
  const conviction = convictionFromThesis(thesis, dbRow?.scenario_probabilities);
  const holdDays = holdDurationDays(createdAt);

  const insertRow = {
    thesis_id: thesis.id,
    thesis_slug: slug,
    outcome: input.outcome,
    resolved_by: input.resolvedBy ?? "manual",
    resolved_price: input.resolvedPrice ?? null,
    predicted_direction: pred,
    actual_direction: actualDirectionForOutcome(input.outcome, pred),
    conviction_at_start: conviction,
    conviction_at_end: conviction,
    hold_duration_days: holdDays,
    pnl: input.pnl ?? null,
    catalyst: input.catalyst?.trim() || null,
    reflection: null as string | null,
  };

  const { data: inserted, error: insertErr } = await sb
    .from("thesis_outcomes")
    .insert(insertRow)
    .select("*")
    .single();
  if (insertErr || !inserted) {
    throw new Error(insertErr?.message ?? "insert_failed");
  }

  const lifecycle = status === "invalidated" ? "invalidated" : "resolved";
  const { error: updateErr } = await sb
    .from("theses")
    .update({
      status,
      outcome: input.outcome,
      lifecycle_state: lifecycle,
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", thesis.id);
  if (updateErr) throw new Error(updateErr.message);

  let record = mapOutcomeRow(inserted as ThesisOutcomeRow);

  try {
    const reflection = await generateReflection(thesis, record);
    if (reflection) {
      const { data: updated } = await sb
        .from("thesis_outcomes")
        .update({ reflection })
        .eq("id", record.id)
        .select("*")
        .single();
      if (updated) record = mapOutcomeRow(updated as ThesisOutcomeRow);
    }
  } catch (e) {
    console.error("[thesis-outcome] reflection_failed", e);
  }

  return record;
}

export async function resolveThesis(
  sb: SupabaseClient,
  thesis: Thesis,
  slug: string,
  input: ResolveThesisInput,
): Promise<ThesisOutcomeRecord> {
  if (!validateResolvableOutcome(input.outcome)) {
    throw new Error("invalid_outcome");
  }
  return insertOutcomeAndUpdateThesis(sb, thesis, slug, input, "resolved");
}

export async function invalidateThesis(
  sb: SupabaseClient,
  thesis: Thesis,
  slug: string,
  catalyst: string,
): Promise<ThesisOutcomeRecord> {
  return insertOutcomeAndUpdateThesis(
    sb,
    thesis,
    slug,
    { outcome: "failed", catalyst, resolvedBy: "manual" },
    "invalidated",
  );
}

export type BookResolvedThesisRow = {
  thesisSlug: string;
  thesisTitle: string;
  outcome: "resolved" | "invalidated";
  resolvedAt: string;
};

export async function fetchBookResolvedTheses(sb: SupabaseClient): Promise<BookResolvedThesisRow[]> {
  const { data, error } = await sb
    .from("thesis_outcomes")
    .select("thesis_slug, outcome, resolved_at, theses ( title )")
    .order("resolved_at", { ascending: false })
    .limit(80);

  if (error || !data?.length) return [];

  return data.map((row) => {
    const r = row as {
      thesis_slug: string;
      outcome: string;
      resolved_at: string;
      theses?: { title?: string | null } | Array<{ title?: string | null }> | null;
    };
    const th = Array.isArray(r.theses) ? r.theses[0] : r.theses;
    const title = (th?.title ?? "").trim() || r.thesis_slug;
    const oc = r.outcome;
    const bookOutcome: "resolved" | "invalidated" =
      oc === "failed" ? "invalidated" : "resolved";
    return {
      thesisSlug: r.thesis_slug,
      thesisTitle: title,
      outcome: bookOutcome,
      resolvedAt: r.resolved_at,
    };
  });
}

export async function fetchTrackRecord(sb: SupabaseClient) {
  const { data: outcomes, error } = await sb
    .from("thesis_outcomes")
    .select(
      `
      *,
      theses ( title, micro_label, slug, insider_flow, body )
    `,
    )
    .order("resolved_at", { ascending: false })
    .limit(500);

  if (error) throw new Error(error.message);

  const thesisIds = (outcomes ?? []).map((o) => (o as ThesisOutcomeRow).thesis_id);
  const categoryByThesis = new Map<string, string>();

  if (thesisIds.length > 0) {
    const { data: links } = await sb
      .from("event_thesis_links")
      .select("thesis_id, event_id")
      .in("thesis_id", thesisIds);

    const eventIds = Array.from(
      new Set((links ?? []).map((l) => String((l as { event_id: string }).event_id))),
    );
    if (eventIds.length > 0) {
      const { data: events } = await sb.from("causal_events").select("id, category").in("id", eventIds);
      const catByEvent = new Map(
        (events ?? []).map((e) => [String((e as { id: string }).id), String((e as { category: string }).category)]),
      );
      for (const link of links ?? []) {
        const tid = String((link as { thesis_id: string }).thesis_id);
        const eid = String((link as { event_id: string }).event_id);
        const cat = catByEvent.get(eid);
        if (cat) categoryByThesis.set(tid, cat);
      }
    }
  }

  const enriched = (outcomes ?? []).map((row) => ({
    ...(row as ThesisOutcomeRow),
    event_category: categoryByThesis.get((row as ThesisOutcomeRow).thesis_id) ?? null,
  }));

  return buildTrackRecord(enriched);
}
