export type ThesisDirection = "short" | "long";
export type ThesisStatus = "Ready" | "Active" | "Watching" | "Draft";

export interface Thesis {
  slug: string;
  title: string;
  statement: string;
  summary: string;
  description: string;
  asset: string;
  assetClass: "Equity" | "Rates" | "FX" | "Commodities" | "Crypto";
  direction: ThesisDirection;
  status: ThesisStatus;
  tradeable: boolean;
  /** Thesis conviction (Clean win + Messy win). Same contract as `displayConvictionPctFromApiThesis` / engine selectors. */
  conviction: number;
  convictionRationale: string;
  mispricingScore: number;
  mispricingComponents: {
    structuralSetup: number;
    resolutionPathShape: number;
    convictionAlignment: number;
    evidenceFreshness: number;
    convictionVsSetup: number;
  };
  horizon: string;
  advisory: string;
  invalidation: string;
  whyNow: string;
  whatMarketHasntPriced: string;
  trigger: string;
  trade: string;
  timeStop: string;
  isEntryValid: boolean;
  /**
   * When false, resolution path percentages are intentionally suppressed (template-only user thesis
   * with no DB `scenario_probabilities`). Otherwise show Clean/Messy/Broken % from the merged display triple.
   */
  showResolutionPathPercentages: boolean;
  /**
   * True when merged resolution-path weights still match a shipped template triple (shared starter defaults).
   * Not a per-thesis AI calibration signal — see `THESIS_CONVICTION_TEMPLATE_NOTE_SHORT` in UI.
   */
  convictionIsTemplateEstimate: boolean;
  resolutionPaths: {
    cleanWin: ResolutionPath;
    messyWin: ResolutionPath;
    thesisBroken: ResolutionPath;
  };
  fourLevelCascade: {
    l1: CascadeLevel;
    l2: CascadeLevel;
    l3: CascadeLevel;
    l4: CascadeLevel;
  };
  tradePlan: TradePlan;
  insiderFlow: InsiderFlow;
  relatedAssets: RelatedAsset[];
  lastUpdated: string;
}

export interface ResolutionPath {
  probability: number;
  whatHappens: string;
  tradeImpact: string;
}

export interface CascadeLevel {
  timeframe: string;
  label: string;
  description: string;
}

export interface TradePlan {
  status: string;
  rrCheck: string;
  rrWarning: string;
  entryZone: string;
  stop: string;
  stopColor: "red" | "zinc";
  target1: string;
  target2: string;
  timeHorizon: string;
  recommendation: string;
  recommendationColor: "emerald" | "amber" | "red";
}

export interface InsiderFlow {
  bullInstruments: string[];
  bearInstruments: string[];
  confirmTags: string[];
  contradictTags: string[];
}

export interface RelatedAsset {
  symbol: string;
  type: "Primary" | "Secondary";
}

export interface ThesisAssessment {
  headline: string;
  context: string;
  considerations: string;
  riskFactors: string;
  whyThisThesisExists: string;
  convictionRationale: string;
}

export interface EvidenceItem {
  id: string;
  timestamp: string;
  title: string;
  source: string;
  body?: string;
}

export interface LinkedPosition {
  open: number;
  closed: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  reply: string;
}

/** List row; `starred` is returned when the request is authenticated. */
export interface ThesisListItem {
  slug: string;
  title: string;
  statement: string;
  asset: string;
  direction: ThesisDirection;
  status: ThesisStatus;
  conviction: number;
  /** Same semantics as detail API `convictionIsTemplateEstimate` — list/detail stay aligned. */
  convictionIsTemplateEstimate: boolean;
  mispricingScore: number;
  whyNow: string;
  lastUpdated: string;
  starred: boolean;
}

export interface ThesisListResponse {
  focus: ThesisListItem[];
  monitor: ThesisListItem[];
}
