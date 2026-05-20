import type { IncentiveAnalysis } from "@/types/incentive-analysis";

/** Causal graph types for /map and GET /api/causal-graph. */

export type EventCategory =
  | "geopolitics"
  | "monetary_policy"
  | "fiscal_policy"
  | "commodity_supply"
  | "demand_shock"
  | "technology"
  | "climate"
  | "trade_policy";

export interface CausalAsset {
  id: string;
  symbol: string;
  name: string;
}

export interface CausalAffectWithAsset extends CausalAffect {
  asset: CausalAsset;
}

export interface CausalChainResponse {
  thesis: CausalThesis;
  rootEvent: CausalEvent;
  targetAsset: CausalAsset;
  affects: CausalAffectWithAsset[];
  relatedTheses: CausalThesis[];
  impliedEffects: ClusterImpliedEffect[];
}

export type CausalEventStatus = "active" | "resolved" | "faded";

export interface CausalEvent {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: EventCategory;
  status: CausalEventStatus;
  confidence: number;
  firstDetected: string;
  lastUpdated?: string;
}

export type TimeDepth = "L1_confirmed" | "L2_this_week" | "L3_this_month" | "L4_this_quarter";
export type AssetDepth = "root" | "direct" | "indirect" | "speculative";

export const TIME_DEPTH_LABELS: Record<TimeDepth, string> = {
  L1_confirmed: "D1 — Confirmed now",
  L2_this_week: "D2 — This week",
  L3_this_month: "D3 — This month",
  L4_this_quarter: "D4 — This quarter",
};

export const ASSET_DEPTH_LABELS: Record<AssetDepth, string> = {
  root: "Root",
  direct: "Direct",
  indirect: "Indirect",
  speculative: "Speculative",
};

export const TIME_DEPTHS: TimeDepth[] = [
  "L1_confirmed",
  "L2_this_week",
  "L3_this_month",
  "L4_this_quarter",
];
export const ASSET_DEPTHS: AssetDepth[] = ["root", "direct", "indirect", "speculative"];

export interface CausalAffect {
  id?: string;
  assetId?: string;
  assetSymbol: string;
  assetName?: string;
  direction: "up" | "down" | "neutral";
  strength: number;
  pricedInPercent: number;
  mispricingScore: number;
  whyItMatters: string;
  hasDedicatedThesis: boolean;
  thesisSlug?: string;
  timeDepth?: TimeDepth;
  assetDepth?: AssetDepth;
}

export interface CausalThesis {
  id: string;
  slug: string;
  title: string;
  statement: string;
  targetAssetSymbol: string;
  direction: "up" | "down";
  conviction: number;
  mispricingScore: number;
  timeHorizon: string;
  affects: CausalAffect[];
  incentive_analysis?: IncentiveAnalysis;
  /** 0–100 from `public.theses.quality_score` (promotion gate). */
  qualityScore?: number;
  /** 0–100 market priced-in estimate (`priced_in_estimate` or body trade plan). */
  pricedInEstimate?: number;
}

export interface MatrixCell {
  assetId: string;
  assetSymbol: string;
  assetName: string;
  direction: "up" | "down" | "neutral";
  strength: number;
  pricedInPercent: number;
  mispricingScore: number;
  hasThesis: boolean;
  thesisSlug?: string;
  thesisTitle?: string;
  conviction?: number;
  whyItMatters: string;
  timeHorizon?: string;
}

export interface CausalMatrixData {
  event: CausalEvent;
  cells: Partial<Record<TimeDepth, Partial<Record<AssetDepth, MatrixCell>>>>;
  missingCells: Array<{ timeDepth: TimeDepth; assetDepth: AssetDepth; note: string }>;
  lastUpdated: string;
}

export interface ClusterImpliedEffect {
  id: string;
  assetSymbol: string;
  netDirection: "up" | "down" | "neutral";
  netStrength: number;
  pricedInPercent: number;
  fromTheses: string[];
  hasDedicatedThesis: boolean;
  whyItMatters: string;
  thesisSlug?: string;
}

export interface ConflictWarning {
  thesisA: string;
  thesisB: string;
  conflict: string;
}

export interface ThesisCluster {
  event: CausalEvent;
  theses: CausalThesis[];
  impliedEffects: ClusterImpliedEffect[];
  compositeMispricing: number;
  conflictWarnings: ConflictWarning[];
}

export interface GlobalCausalGraph {
  clusters: ThesisCluster[];
  activeEvents: number;
  totalTheses: number;
  lastUpdated: string;
}

export type ThesisDailyUpdate = {
  thesisId: string;
  thesisSlug: string;
  thesisTitle: string;
};

/** GET /api/causal-graph/clusters — thesis list clustering surface. */
export interface CausalGraphClustersResponse {
  clusters: ThesisCluster[];
  isolated: CausalThesis[];
  drafts: CausalThesis[];
  activeEvents: number;
  totalTheses: number;
  lastUpdated: string;
  /** Theses with audit activity in the last 24h (for digest banner). */
  dailyUpdates?: ThesisDailyUpdate[];
  /** Thesis ids with updates in the last 24h (pulse on cards). */
  recentlyUpdatedThesisIds?: string[];
}
