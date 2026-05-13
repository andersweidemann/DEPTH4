import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MacroEventReasoning } from "@/lib/macro-reasoning/schema";
import { normalizeThesisNarrativeFields, thesisToDbBodyPayload } from "@/lib/thesis-engine-v2/thesis-db-body";
import { scenarioProbabilitiesForDb } from "@/lib/thesis-engine-v2/insider-flow-config";
import type { Thesis, ThesisStatus } from "@/lib/thesis-engine-v2/types";

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
    "This thesis was formed from analyzed news. Refine narrative blocks on the detail page as the story develops.";

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
    thesisCascade: {
      l1Confirmed: "Cluster headlines and reasoning summary.",
      l2ThisQuarter: "Second-order effects from macro reasoning output.",
      l3ThisYear: "Third-order backdrop if the thesis persists.",
      l4Backdrop2026: "Structural context from reasoning chain.",
    },
    insiderFlow: { bullInstruments: [], bearInstruments: [], confirmTags: [], contradictTags: [] },
  };

  return normalizeThesisNarrativeFields(shell);
}

/**
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
  const statement =
    (p.titleHint ?? "").trim() ||
    (p.reasoning.event_summary ?? "").trim() ||
    (p.reasoning.thesis_trade_line ?? "").trim() ||
    "AI-discovered thesis";
  const slug = slugify(statement, clusterId.replace(/-/g, "").slice(0, 10));

  const thesis = buildMinimalAiThesis({
    id,
    slug,
    statement,
    clusterId,
    reasoning: p.reasoning,
  });

  const nowIso = new Date().toISOString();
  const row = {
    id: thesis.id,
    title: thesis.title,
    status: thesis.status,
    thesis_origin: "ai_generated" as const,
    scenario_probabilities: scenarioProbabilitiesForDb(thesis),
    insider_flow: thesis.insiderFlow,
    slug: thesis.slug,
    owner_user_id: null,
    updated_at: nowIso,
    body: thesisToDbBodyPayload(thesis),
    created_at: nowIso,
    discovery_cluster_id: clusterId,
    generation_confidence: typeof p.reasoning.confidence === "number" ? p.reasoning.confidence : null,
    generation_reasoning_summary: (p.reasoning.reasoning_summary ?? "").trim().slice(0, 2000) || null,
    first_detected_at: nowIso,
    last_refreshed_at: nowIso,
    ai_generation_version: "event_reasoning_v1",
  };

  const { error: insErr } = await admin.from("theses").insert(row as never);
  if (insErr) {
    const msg = insErr.message.toLowerCase();
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
    return { ok: false, reason: insErr.message };
  }

  return { ok: true, thesisId: id, created: true };
}
