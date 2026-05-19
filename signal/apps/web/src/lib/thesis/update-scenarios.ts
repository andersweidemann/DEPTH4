import type { SupabaseClient } from "@supabase/supabase-js";
import { createPipelineLlmClient } from "@/lib/ai/thesis-pipeline-llm";
import { generateWhatChanged } from "@/lib/ai/thesis-pipeline-continuous";
import type { ContinuousNewsItem } from "@/lib/ai/thesis-pipeline-continuous";
import {
  formatScenarioShiftSummary,
  maxScenarioDelta,
  updateResolutionProbabilities,
} from "@/lib/ai/resolution-probability-update";
import type { DbScenarioTriple } from "@/lib/thesis-engine-v2/thesis-display-scenarios";
import { SYSTEM_MUTATION, systemUpdateThesis } from "@/lib/thesis-mutation";

export type RemodelScenariosInput = {
  thesisId: string;
  /** When set, backfill `probability_before` / `probability_after` on this log row. */
  evidenceLogId?: string;
  headline: string;
  source?: string;
};

function parseScenarioTriple(raw: unknown): DbScenarioTriple | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const base = Number(o.base);
  const bull = Number(o.bull);
  const bear = Number(o.bear);
  if (![base, bull, bear].every((n) => Number.isFinite(n))) return null;
  return { base: Math.round(base), bull: Math.round(bull), bear: Math.round(bear) };
}

function newsFromInput(input: RemodelScenariosInput): ContinuousNewsItem {
  const headline = input.headline.trim().slice(0, 480) || "New evidence";
  return {
    headline,
    source: (input.source ?? "DEPTH4").trim().slice(0, 120) || "DEPTH4",
    timestamp: new Date().toISOString(),
    summary: headline,
  };
}

/**
 * Re-model Clean/Messy/Broken when new evidence lands (e.g. pipeline `thesis_evidence_log` without triples).
 * Persists `scenario_probabilities`, backfills the evidence log row, and writes `thesis_updates` with `what_changed`.
 */
export async function remodelScenariosOnEvidence(
  admin: SupabaseClient,
  input: RemodelScenariosInput,
): Promise<{ ok: boolean; reason?: string; scenarios?: DbScenarioTriple; whatChanged?: string }> {
  const llm = createPipelineLlmClient();
  if (!llm) return { ok: false, reason: "missing_llm" };

  const { data: row, error } = await admin
    .from("theses")
    .select("id, slug, title, body, scenario_probabilities")
    .eq("id", input.thesisId)
    .maybeSingle();

  if (error || !row) return { ok: false, reason: "thesis_not_found" };

  const body =
    row.body && typeof row.body === "object" && !Array.isArray(row.body)
      ? (row.body as Record<string, unknown>)
      : {};
  const directionRaw = String(body.direction ?? "watch");
  const direction =
    directionRaw === "long" || directionRaw === "short" || directionRaw === "watch"
      ? directionRaw
      : "watch";

  const prior =
    parseScenarioTriple(row.scenario_probabilities) ?? ({ base: 33, bull: 34, bear: 33 } as DbScenarioTriple);

  const newsItem = newsFromInput(input);
  const next = await updateResolutionProbabilities(
    { title: String(row.title ?? ""), direction, body },
    prior,
    newsItem,
    llm,
  );

  const delta = maxScenarioDelta(prior, next);
  const pathShiftSummary = delta >= 3 ? formatScenarioShiftSummary(prior, next) : null;

  const thesisPick = {
    title: String(row.title ?? ""),
    thesisStatement: String(body.thesis_statement ?? row.title ?? ""),
    asset: String(body.asset ?? body.target_asset ?? "—"),
    direction: direction as "long" | "short" | "watch",
  };

  const whatChanged =
    pathShiftSummary ??
    (delta >= 3
      ? await generateWhatChanged(thesisPick, newsItem, undefined, llm)
      : delta > 0
        ? `New evidence logged for ${thesisPick.asset}: ${newsItem.headline.slice(0, 160)}`
        : "");

  if (delta > 0 || whatChanged) {
    const upd = await systemUpdateThesis(
      admin,
      input.thesisId,
      {
        scenario_probabilities: next,
        updated_at: new Date().toISOString(),
      } as never,
      {
        actorType: SYSTEM_MUTATION.news.actorType,
        reason: whatChanged || pathShiftSummary || "Evidence-driven scenario refresh",
        changeType: pathShiftSummary ? "scenario_shift" : "evidence",
        metadata: {
          source: "remodel_scenarios_on_evidence",
          headline: newsItem.headline,
          news_source: newsItem.source,
          what_changed: whatChanged,
          scenario_probabilities_before: prior,
          scenario_probabilities_after: next,
          evidence_log_id: input.evidenceLogId ?? null,
        },
      },
    );
    if (!upd.ok) return { ok: false, reason: upd.error };
  }

  if (input.evidenceLogId) {
    await admin
      .from("thesis_evidence_log")
      .update({
        probability_before: prior,
        probability_after: next,
      } as never)
      .eq("id", input.evidenceLogId);
  }

  if (delta >= 3) {
    console.log("[pipeline] Updating existing thesis scenarios", {
      thesis_id: input.thesisId,
      delta,
      clean: next.bull,
      messy: next.base,
      broken: next.bear,
    });
  }

  return { ok: true, scenarios: next, whatChanged: whatChanged || undefined };
}

/** Insert pipeline evidence row and re-model resolution paths + audit `what_changed`. */
export async function insertEvidenceAndRemodelScenarios(
  admin: SupabaseClient,
  thesisId: string,
  row: {
    event_type: string;
    description: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const { data: inserted, error: evErr } = await admin
    .from("thesis_evidence_log")
    .insert({
      thesis_id: thesisId,
      event_type: row.event_type,
      description: row.description,
      metadata: row.metadata ?? {},
    } as never)
    .select("id")
    .single();

  if (evErr) {
    console.warn("[pipeline] evidence_insert_failed", { message: evErr.message, thesisId });
    return;
  }

  const meta = row.metadata ?? {};
  const source =
    (typeof meta.source === "string" && meta.source.trim()) ||
    row.description.match(/^\[([^\]]+)\]/)?.[1] ||
    "DEPTH4";
  const headline = row.description.replace(/^\[[^\]]+\]\s*/, "").trim() || row.description;

  const remodel = await remodelScenariosOnEvidence(admin, {
    thesisId,
    evidenceLogId: String(inserted.id),
    headline,
    source,
  }).catch((e) => ({ ok: false as const, reason: e instanceof Error ? e.message : "remodel_failed" }));

  if (!remodel.ok) {
    console.warn("[pipeline] remodel_scenarios_failed", { thesisId, reason: remodel.reason });
  } else if (remodel.whatChanged) {
    console.log("[pipeline] Creating new thesis evidence with scenario refresh", {
      thesis_id: thesisId,
      what_changed: remodel.whatChanged.slice(0, 80),
    });
  }
}
