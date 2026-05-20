import type { Thesis, ThesisStatus } from "@/lib/thesis-engine-v2/types";
import { parseLifecycleState } from "@/lib/theses/thesis-lifecycle";
import { parseScenarioProbabilities } from "@/lib/thesis-engine-v2/catalog-thesis-titles-server";
import { insiderFlowFromDb } from "@/lib/thesis-engine-v2/insider-flow-config";
import { mergeDbBodyIntoThesis } from "@/lib/thesis-engine-v2/thesis-db-body";
import { parseIncentiveAnalysis } from "@/lib/thesis/incentive-analysis";
import { mergeUserThesisWithServerCatalog } from "@/lib/thesis-engine-v2/user-thesis-server-merge";
import { resolveAssetSymbol } from "@/lib/theses/resolve-asset-symbol";

const ALLOWED = new Set<ThesisStatus>(["forming", "watching", "ready", "active", "resolved", "invalidated"]);

function thesisOriginFromDb(v: unknown): Thesis["thesisOrigin"] | undefined {
  const o = typeof v === "string" ? v.trim() : "";
  if (o === "user" || o === "seeded_system" || o === "ai_generated") return o;
  return undefined;
}

/** Rebuild a client `Thesis` from a `public.theses` row (user-owned, `ai_generated`, etc.). */
export function userThesisFromSupabaseRow(row: {
  id: string;
  slug: string;
  title: string;
  micro_label?: string | null;
  body?: unknown;
  scenario_probabilities?: unknown;
  status: string;
  insider_flow?: unknown;
  updated_at?: string | null;
  thesis_origin?: string | null;
  lifecycle_state?: unknown;
  incentive_analysis?: unknown;
  quality_score?: number | null;
}): Thesis {
  const st = ALLOWED.has(row.status as ThesisStatus) ? (row.status as ThesisStatus) : "watching";
  const shell: Thesis = {
    id: row.id,
    slug: row.slug,
    title: row.title || "Untitled thesis",
    thesisStatement: row.title || "Untitled thesis",
    microLabel: row.micro_label ?? null,
    asset: "—",
    direction: "watch",
    probability: 50,
    status: st,
    probabilityRationale: "Synced from your account.",
    origin: "user",
    hiddenDriver: "",
    likelyPath: "",
    marketMisread: "",
    tradeExpression: "",
    whyNow: "",
    whatsUnpriced: "",
    trigger: "",
    trade: "",
    invalidation: "",
    horizon: "—",
    advisoryAction: "watch",
    lastUpdated: row.updated_at ? `Synced · ${row.updated_at}` : "Synced",
    qualification: "emerging",
    scores: {
      driverStrength: 10,
      timeCompression: 10,
      marketMispricingScore: 10,
      tradeClarityScore: 8,
      triggerClarityScore: 8,
      total: 46,
    },
    theme: "macro",
    insiderFlow: insiderFlowFromDb(row.insider_flow),
  };

  let t = mergeDbBodyIntoThesis(shell, row.body ?? null);
  t = mergeUserThesisWithServerCatalog(
    t,
    {
      title: row.title,
      microLabel: row.micro_label ?? null,
      body: row.body ?? null,
      scenarioProbabilities: parseScenarioProbabilities(row.scenario_probabilities),
    },
    { forceApplyDbProbabilities: true },
  );
  const thesisOrigin = thesisOriginFromDb(row.thesis_origin);
  const lifecycle_state = parseLifecycleState(row.lifecycle_state);
  const incentiveAnalysis = parseIncentiveAnalysis(row.incentive_analysis);
  let withMeta = thesisOrigin ? { ...t, thesisOrigin } : t;
  if (lifecycle_state) withMeta = { ...withMeta, lifecycle_state };
  if (incentiveAnalysis) withMeta = { ...withMeta, incentiveAnalysis };
  if (row.quality_score != null && Number.isFinite(row.quality_score)) {
    withMeta = { ...withMeta, qualityScore: Math.min(100, Math.max(0, Math.round(row.quality_score))) };
  }
  const resolvedAsset = resolveAssetSymbol({
    assetLabel: withMeta.asset,
    title: row.title,
    body: row.body ?? null,
  });
  if (resolvedAsset !== "—") {
    withMeta = { ...withMeta, asset: resolvedAsset };
  }
  return withMeta;
}
