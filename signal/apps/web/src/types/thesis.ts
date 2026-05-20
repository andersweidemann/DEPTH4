import type { ThesisOutcomeKind } from "@/types/thesis-outcome";

export type ThesisDirection = "short" | "long";
export type ThesisStatus = "Ready" | "Active" | "Watching" | "Draft";

/** Phase 1 derived registry / terminal state (DB column in Phase 2). */
export type ThesisLifecycleState = "discovered" | "live" | "resolved" | "invalidated" | "archived";

/** Phase 1 homepage bucket (DB column in Phase 2). */
export type ThesisSurfacedBucket = "tradable" | "emerging" | "monitoring";

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
  /** Thesis conviction (Clean win + Messy win). Same contract as `displayConvictionPctFromApiThesis` / `canonicalConvictionPercentFromEngineThesis` on engine thesis. */
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
  /** Stable id for catalog + user theses — aligns list UI with `ThesisLiveProvider.mergeThesis`. */
  thesisId: string;
  /**
   * Effective `{base,bull,bear}` used to compute `conviction` on the server (always sent on fresh payloads).
   * Legacy clients may still see `null` until SWR refetch; the client then infers defaults from catalog bundle.
   */
  listBaselineScenarioTriple: { base: number; bull: number; bear: number } | null;
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
  /** Derived Phase 1 — not written to DB yet. */
  lifecycle_state?: ThesisLifecycleState;
  /** Derived Phase 1 — `null` when not in tradable/emerging/monitoring (e.g. archive rows). */
  surfaced_bucket?: ThesisSurfacedBucket | null;
  /** Derived Phase 1 ranking input (rounded). */
  thesis_score?: number;
  /** When set on resolved/invalidated rows (DB or admin). */
  outcome_label?: string | null;
  /** Formal resolution from `thesis_outcomes` / `theses.outcome`. */
  outcome?: ThesisOutcomeKind | null;
  /**
   * True when `/api/theses/[slug]` can resolve this row (catalog bundle, `ai_generated`, or current-user `user`).
   * List UI must not link to `/theses/[slug]` when false.
   */
  detailResolvable: boolean;
  /** User-owned thesis calibration phase (WATCHING vs TRADEABLE). */
  user_calibration_phase?: "assessing" | "tradeable" | "watching_no_edge";
}

export interface ThesisHomeBuckets {
  tradable: ThesisListItem[];
  emerging: ThesisListItem[];
  monitoring: ThesisListItem[];
  archivePreview: ThesisListItem[];
}

export interface ThesisListResponse {
  focus: ThesisListItem[];
  monitor: ThesisListItem[];
  /** Bucketed homepage sections; per-section caps only, no global thesis cap. */
  home: ThesisHomeBuckets;
}

/** GET /api/theses/archive — terminal user-owned theses only. */
export interface ThesisArchiveListResponse {
  items: ThesisListItem[];
}

/** GET /api/theses/home-signals — lightweight catalog surfacing utility (Phase 6). */
export interface ThesisHomeSignalsResponse {
  catalogLeader: { thesisId: string; slug: string; thesisScore: number } | null;
}

/** GET /api/theses/[slug]/updates — append-only mutation history (Phase 1). */
export interface ThesisUpdateListItem {
  id: string;
  thesisId: string;
  createdAt: string;
  actorType: string;
  actorId: string | null;
  changeType: string;
  reason: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
}

export interface ThesisUpdatesResponse {
  items: ThesisUpdateListItem[];
  supersedesThesisId: string | null;
  supersedesSlug: string | null;
}
