import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isPlaceholderTradeLevel,
  readEvidenceFromBody,
  verifyPipelineBodyForRender,
} from "@/lib/ai/thesis-pipeline-body";
import { completeKimiJsonObject, isKimiJsonConfigured } from "@/lib/macro-reasoning/kimi-messages";
import { parseIncentiveAnalysis } from "@/lib/thesis/incentive-analysis";
import { cleanMessyBrokenToTriple, normalizeScenarioTriple } from "@/lib/thesis/remodel-scenarios";
import { buildDepth4LlmSystemPrompt } from "@/lib/thesis-engine-v2/depth4-llm-system-prompt";

export type PopulateUserThesisInput = {
  title: string;
  assetSymbol: string;
  direction: string;
  timeHorizon: string;
};

type PathLeg = {
  probability?: number;
  description?: string;
  trigger?: string;
};

type PopulateAiPayload = {
  incentive_analysis?: Record<string, unknown>;
  causal_chain?: Array<Record<string, unknown>>;
  tradePlan?: Record<string, unknown>;
  resolutionPaths?: {
    clean?: PathLeg | string;
    messy?: PathLeg | string;
    broken?: PathLeg | string;
  };
  evidence?: Array<Record<string, unknown>>;
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function pathLeg(raw: PathLeg | string | undefined): PathLeg | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    const t = raw.trim();
    return t ? { description: t } : null;
  }
  if (typeof raw !== "object") return null;
  const description = str(raw.description) || str(raw.trigger);
  if (!description) return null;
  return {
    probability: Number.isFinite(Number(raw.probability)) ? Number(raw.probability) : undefined,
    description,
    trigger: str(raw.trigger),
  };
}

export function parsePopulateUserThesisPayload(raw: unknown): PopulateAiPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const rpRaw = (o.resolutionPaths ?? o.resolution_paths) as PopulateAiPayload["resolutionPaths"];
  return {
    incentive_analysis:
      o.incentive_analysis && typeof o.incentive_analysis === "object" && !Array.isArray(o.incentive_analysis)
        ? (o.incentive_analysis as Record<string, unknown>)
        : undefined,
    causal_chain: Array.isArray(o.causal_chain)
      ? (o.causal_chain as Array<Record<string, unknown>>)
      : undefined,
    tradePlan:
      (o.tradePlan ?? o.trade_plan) && typeof (o.tradePlan ?? o.trade_plan) === "object"
        ? ((o.tradePlan ?? o.trade_plan) as Record<string, unknown>)
        : undefined,
    resolutionPaths: rpRaw,
    evidence: Array.isArray(o.evidence) ? (o.evidence as Array<Record<string, unknown>>) : undefined,
  };
}

function buildPopulatePrompt(input: PopulateUserThesisInput): string {
  return [
    "You are a macro analyst at DEPTH4. A user created a new thesis:",
    "",
    `Title: ${input.title}`,
    `Asset: ${input.assetSymbol}`,
    `Direction: ${input.direction}`,
    `Time horizon: ${input.timeHorizon}`,
    "",
    "Populate the thesis body with:",
    "1. An incentive analysis (who benefits, what must happen)",
    "2. A causal chain (2-3 steps)",
    "3. A trade plan (entryZone, stopLoss, targetPrice based on plausible market context)",
    "4. Three scenarios (Clean/Messy/Broken with probabilities summing to 100)",
    "5. Initial evidence (1-2 supporting headlines)",
    "",
    "Output ONLY this JSON:",
    `{`,
    `  "incentive_analysis": {`,
    `    "actor": "...",`,
    `    "goal": "...",`,
    `    "constraint": "...",`,
    `    "required_action": "...",`,
    `    "most_likely_action": "...",`,
    `    "confidence": 55,`,
    `    "reasoning": "..."`,
    `  },`,
    `  "causal_chain": [`,
    `    { "step": 1, "event": "...", "asset": "...", "expected_move": "..." }`,
    `  ],`,
    `  "tradePlan": {`,
    `    "entryZone": "$X-Y",`,
    `    "stopLoss": "$Z (rationale)",`,
    `    "targetPrice": "$W (rationale)",`,
    `    "rationale": "..."`,
    `  },`,
    `  "resolutionPaths": {`,
    `    "clean": { "probability": 40, "description": "...", "trigger": "..." },`,
    `    "messy": { "probability": 35, "description": "...", "trigger": "..." },`,
    `    "broken": { "probability": 25, "description": "...", "trigger": "..." }`,
    `  },`,
    `  "evidence": [`,
    `    { "headline": "...", "source": "...", "date": "YYYY-MM-DD", "impact": "supporting" }`,
    `  ]`,
    `}`,
  ].join("\n");
}

export function bodyPatchFromPopulatePayload(
  parsed: PopulateAiPayload,
  assetSymbol: string,
): {
  body: Record<string, unknown>;
  scenarioProbabilities: { base: number; bull: number; bear: number };
  incentiveAnalysis: Record<string, unknown> | null;
} {
  const clean = pathLeg(parsed.resolutionPaths?.clean);
  const messy = pathLeg(parsed.resolutionPaths?.messy);
  const broken = pathLeg(parsed.resolutionPaths?.broken);

  const scenarios = normalizeScenarioTriple({
    clean: clean?.probability ?? 40,
    messy: messy?.probability ?? 35,
    broken: broken?.probability ?? 25,
  });

  const tp = parsed.tradePlan ?? {};
  const entryZone = str(tp.entryZone ?? tp.entry_zone);
  const stopLoss = str(tp.stopLoss ?? tp.stop);
  const targetPrice = str(tp.targetPrice ?? tp.target1 ?? tp.target);

  const evidence = (parsed.evidence ?? [])
    .map((row) => {
      const excerpt = str(row.headline ?? row.excerpt);
      if (!excerpt) return null;
      return {
        date: str(row.date) || new Date().toISOString().slice(0, 10),
        source: str(row.source) || "news",
        excerpt,
        url: row.url != null ? String(row.url) : null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);

  const causalSteps = (parsed.causal_chain ?? [])
    .map((step) => str(step.event))
    .filter(Boolean);

  const body: Record<string, unknown> = {
    target_asset: assetSymbol,
    tradePlan: {
      entry_zone: entryZone || null,
      stop: stopLoss || null,
      target1: targetPrice || null,
      target2: null,
      rationale: str(tp.rationale) || null,
      populatedAt: new Date().toISOString(),
    },
    entry_zone: entryZone || null,
    stop: stopLoss || null,
    target1: targetPrice || null,
    resolutionPaths: {
      clean: clean?.description ?? "",
      messy: messy?.description ?? "",
      broken: broken?.description ?? "",
    },
    scenario_overrides: {
      base: {
        probability: scenarios.messy,
        confirmation: messy?.description ?? messy?.trigger ?? "Partial confirmation with noise.",
        marketConsequence: messy?.trigger ?? "Size for chop; follow trade plan until path clarifies.",
      },
      bull: {
        probability: scenarios.clean,
        confirmation: clean?.description ?? clean?.trigger ?? "Thesis plays out as written.",
        marketConsequence: clean?.trigger ?? "Take targets per trade plan.",
      },
      bear: {
        probability: scenarios.broken,
        confirmation: broken?.description ?? broken?.trigger ?? "Invalidation scenario fires.",
        marketConsequence: broken?.trigger ?? "Stand down or hedge per invalidation.",
      },
    },
    evidence,
    causal_chain: parsed.causal_chain ?? [],
    ...(causalSteps[0] ? { hidden_driver: causalSteps[0] } : {}),
    ...(causalSteps[1] ? { likely_path: causalSteps[1] } : {}),
    ...(causalSteps[2] ? { trade_expression: causalSteps[2] } : {}),
  };

  const incentive = parseIncentiveAnalysis(parsed.incentive_analysis);
  return {
    body,
    scenarioProbabilities: cleanMessyBrokenToTriple(scenarios),
    incentiveAnalysis: incentive
      ? {
          actor: incentive.actor,
          goal: incentive.goal,
          constraint: incentive.constraint,
          required_action: incentive.required_action,
          most_likely_action: incentive.most_likely_action,
          confidence: incentive.confidence,
          time_window: incentive.time_window,
          catalyst_events: incentive.catalyst_events,
          alternative_actions: incentive.alternative_actions,
          reasoning: incentive.reasoning,
        }
      : null,
  };
}

/** True when the row still needs AI-filled trade plan / scenarios / evidence. */
export function shouldAutoPopulateUserThesisBody(body: unknown): boolean {
  return !verifyPipelineBodyForRender(body).ok;
}

export async function insertSeedEvidenceLogRows(
  admin: SupabaseClient,
  thesisId: string,
  body: Record<string, unknown>,
  triple: { base: number; bull: number; bear: number },
): Promise<void> {
  const items = readEvidenceFromBody(body);
  if (items.length === 0) return;

  const rows = items.slice(0, 4).map((item, idx) => {
    const impact = item.source.toLowerCase().includes("contradict") ? "contradicting" : "supporting";
    const dedupe = `populate:${thesisId}:${idx}:${item.excerpt.slice(0, 80)}`;
    return {
      thesis_id: thesisId,
      event_type: "user_thesis_seed",
      description: item.excerpt,
      metadata: {
        source: item.source,
        date: item.date,
        url: item.url,
        impact,
        seeded_by: "populate_user_thesis_body",
      },
      probability_before: triple,
      probability_after: triple,
      dedupe_key: dedupe,
    };
  });

  const { error } = await admin.from("thesis_evidence_log").upsert(rows, {
    onConflict: "dedupe_key",
    ignoreDuplicates: true,
  });
  if (error) {
    console.warn("[populateUserThesisBody] evidence_log_insert", { thesisId, message: error.message });
  }
}

/**
 * Lightweight Kimi pass after user thesis creation. Never throws — logs and returns on failure.
 */
export async function populateUserThesisBody(
  supabase: SupabaseClient,
  thesisId: string,
  thesisData: PopulateUserThesisInput,
): Promise<boolean> {
  if (!isKimiJsonConfigured()) {
    console.warn("[populateUserThesisBody] KIMI_API_KEY not set — skip populate");
    return false;
  }

  try {
    const { data: row, error: selErr } = await supabase
      .from("theses")
      .select("body, thesis_origin")
      .eq("id", thesisId)
      .maybeSingle();

    if (selErr || !row) {
      console.warn("[populateUserThesisBody] load_failed", { thesisId, message: selErr?.message });
      return false;
    }
    if (row.thesis_origin !== "user") return false;

    const priorBody =
      row.body && typeof row.body === "object" && !Array.isArray(row.body)
        ? (row.body as Record<string, unknown>)
        : {};

    if (!shouldAutoPopulateUserThesisBody(priorBody)) return true;

    const raw = await completeKimiJsonObject({
      system: buildDepth4LlmSystemPrompt({
        preamble: "You are DEPTH4's macro analyst filling a new user thesis body.",
      }),
      user: buildPopulatePrompt(thesisData),
      maxTokens: 2048,
    });

    const parsed = parsePopulateUserThesisPayload(raw);
    if (!parsed) {
      console.warn(`[populateUserThesisBody] AI returned null for thesis ${thesisId}`);
      return false;
    }

    const { body: patch, scenarioProbabilities, incentiveAnalysis } = bodyPatchFromPopulatePayload(
      parsed,
      thesisData.assetSymbol,
    );

    const tp = patch.tradePlan as Record<string, unknown> | undefined;
    if (
      tp &&
      (isPlaceholderTradeLevel(String(tp.entry_zone ?? "")) ||
        isPlaceholderTradeLevel(String(tp.stop ?? "")))
    ) {
      console.warn(`[populateUserThesisBody] trade plan still placeholder for ${thesisId}`);
    }

    const mergedBody = { ...priorBody, ...patch };
    const nowIso = new Date().toISOString();
    const update: Record<string, unknown> = {
      body: mergedBody,
      scenario_probabilities: scenarioProbabilities,
      updated_at: nowIso,
      last_meaningful_update_at: nowIso,
    };
    if (incentiveAnalysis) update.incentive_analysis = incentiveAnalysis;

    const { error: upErr } = await supabase.from("theses").update(update).eq("id", thesisId);
    if (upErr) {
      console.warn("[populateUserThesisBody] update_failed", { thesisId, message: upErr.message });
      return false;
    }

    await insertSeedEvidenceLogRows(supabase, thesisId, mergedBody, scenarioProbabilities);
    console.info("[populateUserThesisBody] ok", { thesisId });
    return true;
  } catch (e) {
    console.warn("[populateUserThesisBody] error", {
      thesisId,
      message: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}
