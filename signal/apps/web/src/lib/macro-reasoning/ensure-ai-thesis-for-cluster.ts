import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MacroEventReasoning } from "@/lib/macro-reasoning/schema";
import { extractReasoningLevelBodies, passesAiThesisRegistryDepth4Pack } from "@/lib/theses/ai-registry-depth4-pack";
import { isAcceptableAiThesisRegistryHero, pickAiThesisStatementFromReasoning } from "@/lib/theses/thesis-surfacing-quality";
import { generateIncentiveAnalysisForDb } from "@/lib/thesis/incentive-analysis-generator";
import { parseIncentiveAnalysis } from "@/lib/thesis/incentive-analysis";
import { normalizeThesisNarrativeFields, thesisToDbBodyPayload } from "@/lib/thesis-engine-v2/thesis-db-body";
import {
  buildAnatomyFromMacroReasoning,
  validateThesisStructuredAnatomy,
} from "@/lib/thesis-engine-v2/thesis-structured-anatomy";
import { scenarioProbabilitiesForDb } from "@/lib/thesis-engine-v2/insider-flow-config";
import type { Thesis, ThesisStatus } from "@/lib/thesis-engine-v2/types";
import { SYSTEM_MUTATION, systemCreateThesis } from "@/lib/thesis-mutation";
import {
  initialStatusFromQualityReport,
  qualityGateInputFromEngineThesis,
  qualityChecksToJson,
  runQualityGate,
} from "@/lib/thesis/quality-gate";

const MIN_REASONING_CHAIN_LEVEL_CHARS = 24;

/** When the model emitted a well-formed L1–L4 chain, persist it into the thesis book instead of generic placeholders. */
function thesisCascadeFromMacroReasoningChain(
  chain: string | undefined | null,
): NonNullable<Thesis["thesisCascade"]> | null {
  const bodies = extractReasoningLevelBodies((chain ?? "").trim());
  if (!bodies) return null;
  for (const b of bodies) {
    if (b.length < MIN_REASONING_CHAIN_LEVEL_CHARS) return null;
  }
  const cap = (s: string) => s.slice(0, 900);
  return {
    l1Confirmed: cap(bodies[0]),
    l2ThisQuarter: cap(bodies[1]),
    l3ThisYear: cap(bodies[2]),
    l4Backdrop2026: cap(bodies[3]),
  };
}

function slugify(input: string, suffix: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 44);
  return `${base || "ai-thesis"}-${suffix}`;
}

function buildMinimalAiThesis(input: {
  id: string;
  slug: string;
  statement: string;
  clusterId: string;
  reasoning: MacroEventReasoning;
}): Thesis {
  const statement = input.statement.trim().slice(0, 480) || "AI-discovered thesis";
  const now = new Date().toISOString();
  const placeholder =
    "Provisional shell from the news cluster — refine narrative blocks on the detail page as the story develops.";

  const placeholderCascade: NonNullable<Thesis["thesisCascade"]> = {
    l1Confirmed: "Cluster headlines and reasoning summary.",
    l2ThisQuarter: "Second-order effects from macro reasoning output.",
    l3ThisYear: "Third-order backdrop if the thesis persists.",
    l4Backdrop2026: "Structural context from reasoning chain.",
  };
  const thesisCascade =
    thesisCascadeFromMacroReasoningChain(input.reasoning.reasoning_chain) ?? placeholderCascade;

  const shell: Thesis = {
    id: input.id,
    slug: input.slug,
    title: statement.slice(0, 160) || "AI thesis",
    thesisStatement: statement,
    microLabel: "AI · news",
    asset: "—",
    direction: "watch",
    probability: 50,
    status: "forming" as ThesisStatus,
    probabilityRationale: "Initial framing from macro event reasoning — scenarios refine with evidence.",
    origin: "system",
    hiddenDriver: placeholder,
    likelyPath: placeholder,
    marketMisread: "",
    tradeExpression: placeholder,
    whyNow: (input.reasoning.reasoning_summary ?? "").trim().slice(0, 400) || "See linked news cluster.",
    whatsUnpriced: (input.reasoning.mispricing_hypothesis ?? "").trim().slice(0, 400) || "See macro scan.",
    trigger: "Watch for follow-on headlines that confirm or break this channel.",
    trade: "Define expression after the thesis firms; use the book once levels are set.",
    invalidation: "Stand down if the causal chain in the reasoning no longer matches price leadership.",
    horizon: "Weeks to quarters",
    advisoryAction: "watch",
    lastUpdated: now,
    qualification: "emerging",
    scores: {
      driverStrength: 12,
      timeCompression: 10,
      marketMispricingScore: 10,
      tradeClarityScore: 6,
      triggerClarityScore: 6,
      total: 44,
    },
    theme: "macro",
    thesisCascade,
    insiderFlow: { bullInstruments: [], bearInstruments: [], confirmTags: [], contradictTags: [] },
  };

  return normalizeThesisNarrativeFields(shell);
}

/**
 * ### Part C — thesis vs forming narrative
 *
 * **`public.theses` (`thesis_origin = ai_generated`)**  
 * Rows are created **only** after the model output passes the DEPTH4 registry pack (L1–L4, mispricing, timing,
 * macro-tradable asset, causal hero). `status = forming` here means *early but thesis-shaped*, not a scratch note.
 *
 * **`event_reasoning.reasoning` + `forming_narrative_layer`**  
 * Shallow or partial cluster scans live here for internal feed / scanning. They are **not** promoted into the
 * thesis registry when validation fails.
 *
 * Idempotent: one `ai_generated` row per `discovery_cluster_id`.
 * Does not modify catalog conviction baselines — new row only.
 */
export async function ensureAiThesisForDiscoveryCluster(
  admin: SupabaseClient,
  p: {
    clusterId: string;
    titleHint: string | null;
    reasoning: MacroEventReasoning;
  },
): Promise<{ ok: true; thesisId: string; created: boolean } | { ok: false; reason: string }> {
  const clusterId = p.clusterId.trim();
  if (!clusterId) return { ok: false, reason: "empty_cluster_id" };

  const { data: existing, error: exErr } = await admin
    .from("theses")
    .select("id")
    .eq("discovery_cluster_id", clusterId)
    .eq("thesis_origin", "ai_generated")
    .maybeSingle();

  if (exErr) return { ok: false, reason: `lookup:${exErr.message}` };
  const existingId = existing && typeof (existing as { id?: unknown }).id === "string" ? (existing as { id: string }).id.trim() : "";
  if (existingId) return { ok: true, thesisId: existingId, created: false };

  const id = randomUUID();
  const statement = pickAiThesisStatementFromReasoning({
    titleHint: p.titleHint,
    thesisTradeLine: p.reasoning.thesis_trade_line ?? "",
    eventSummary: p.reasoning.event_summary ?? "",
  }).trim();
  if (!isAcceptableAiThesisRegistryHero(statement)) {
    return { ok: false, reason: "reject_non_causal_hero_for_registry" };
  }

  const depth4 = passesAiThesisRegistryDepth4Pack({ hero: statement, reasoning: p.reasoning });
  if (!depth4.ok) {
    return { ok: false, reason: depth4.reason };
  }

  const slug = slugify(statement, clusterId.replace(/-/g, "").slice(0, 10));

  const thesisShell = buildMinimalAiThesis({
    id,
    slug,
    statement,
    clusterId,
    reasoning: p.reasoning,
  });

  const structuredAnatomy = buildAnatomyFromMacroReasoning({
    hero: statement,
    reasoning: p.reasoning,
    assetSymbols: [],
  });
  const anatomyCheck = validateThesisStructuredAnatomy(structuredAnatomy, {
    hero: statement,
    title: statement,
  });
  if (!anatomyCheck.ok) {
    return { ok: false, reason: `anatomy_${anatomyCheck.reasons.join("_")}` };
  }

  let thesis = { ...thesisShell, structuredAnatomy };

  const incentiveColumn = await generateIncentiveAnalysisForDb(thesis);
  const parsedIncentive = parseIncentiveAnalysis(incentiveColumn);
  if (parsedIncentive) {
    thesis = { ...thesis, incentiveAnalysis: parsedIncentive };
  }

  const qualityInput = qualityGateInputFromEngineThesis(thesis);
  const qualityReport = runQualityGate(qualityInput, null, []);
  const gatedStatus = initialStatusFromQualityReport(qualityReport);

  const nowIso = new Date().toISOString();
  const row = {
    id: thesis.id,
    title: thesis.title,
    status: gatedStatus,
    quality_score: qualityReport.score,
    quality_checks: qualityChecksToJson(qualityReport.checks),
    promotion_blocked_reason:
      qualityReport.blockers.length > 0 ? qualityReport.blockers.join(", ") : null,
    thesis_origin: "ai_generated" as const,
    scenario_probabilities: scenarioProbabilitiesForDb(thesis),
    insider_flow: thesis.insiderFlow,
    slug: thesis.slug,
    owner_user_id: null,
    updated_at: nowIso,
    body: thesisToDbBodyPayload(thesis),
    created_at: nowIso,
    ...(incentiveColumn ? { incentive_analysis: incentiveColumn } : {}),
    discovery_cluster_id: clusterId,
    generation_confidence: typeof p.reasoning.confidence === "number" ? p.reasoning.confidence : null,
    generation_reasoning_summary: (p.reasoning.reasoning_summary ?? "").trim().slice(0, 2000) || null,
    first_detected_at: nowIso,
    last_refreshed_at: nowIso,
    ai_generation_version: "event_reasoning_v1",
  };

  const ins = await systemCreateThesis(admin, row, {
    actorType: SYSTEM_MUTATION.macro.actorType,
    reason: SYSTEM_MUTATION.macro.aiRegistryCreateReason,
    changeType: "field_update",
    metadata: {
      source: "ensure_ai_thesis_for_cluster",
      discovery_cluster_id: clusterId,
    },
  });

  if (!ins.ok) {
    const msg = ins.error.toLowerCase();
    if (msg.includes("duplicate") || msg.includes("unique")) {
      const { data: again } = await admin
        .from("theses")
        .select("id")
        .eq("discovery_cluster_id", clusterId)
        .eq("thesis_origin", "ai_generated")
        .maybeSingle();
      const aid = again && typeof (again as { id?: unknown }).id === "string" ? (again as { id: string }).id.trim() : "";
      if (aid) return { ok: true, thesisId: aid, created: false };
    }
    if (ins.auditFailed) return { ok: false, reason: "thesis_audit_write_failed" };
    return { ok: false, reason: ins.error };
  }

  return { ok: true, thesisId: id, created: true };
}
