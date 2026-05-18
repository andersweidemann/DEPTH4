/** Prototype types for the causal graph (/map). Production schema TBD. */

export type EventCategory =
  | "geopolitics"
  | "monetary_policy"
  | "fiscal_policy"
  | "commodity_supply"
  | "demand_shock"
  | "technology"
  | "climate"
  | "trade_policy";

export interface CausalEvent {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: EventCategory;
  confidence: number;
  firstDetected: string;
}

export interface CausalAffect {
  assetSymbol: string;
  direction: "up" | "down" | "neutral";
  strength: number;
  pricedInPercent: number;
  mispricingScore: number;
  whyItMatters: string;
  hasDedicatedThesis: boolean;
  thesisSlug?: string;
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
  affects: CausalAffect[];
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

export interface GlobalCausalGraphMock {
  clusters: ThesisCluster[];
  lastUpdated: string;
}
