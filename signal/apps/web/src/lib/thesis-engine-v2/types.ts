export type ThesisStatus =
  | "watching"
  | "actionable"
  | "active"
  | "resolved"
  | "invalidated";

export type AdvisoryAction = "watch" | "enter" | "hold" | "reduce" | "exit";

export type ThesisQualification = "theme" | "emerging" | "tradeable";

export type ThesisQualificationScores = {
  driverStrength: number; // 0–20
  timeCompression: number; // 0–25
  marketMispricingScore: number; // 0–25
  tradeClarityScore: number; // 0–15
  triggerClarityScore: number; // 0–15
};

export type Thesis = {
  id: string;
  slug: string;
  title: string;
  thesisStatement: string;
  asset: string;
  direction: "long" | "short" | "watch";
  probability: number;
  status: ThesisStatus;
  probabilityRationale: string;
  origin?: "system" | "user";

  // causal framework
  hiddenDriver: string;
  likelyPath: string;
  marketMisread: string;
  tradeExpression: string;

  whyNow: string;
  whatsUnpriced: string;
  trigger: string;
  trade: string;
  invalidation: string;
  horizon: string;
  advisoryAction: AdvisoryAction;
  lastUpdated: string;

  // internal classification (derived from score total, but stored for convenience)
  qualification: ThesisQualification;
  scores: ThesisQualificationScores & { total: number };

  // internal theme label for grouping (e.g. geopolitics, rates, energy)
  theme: string;
  entryZone?: string;
  stop?: string;
  target1?: string;
  target2?: string;
};

export type ThesisEvidence = {
  id: string;
  thesisId: string;
  source: string;
  timestamp: string;
  headline: string;
  impact:
    | "major_positive"
    | "minor_positive"
    | "neutral"
    | "minor_negative"
    | "major_negative";
  probabilityBefore: number;
  probabilityAfter: number;
  interpretation: string;
};

export type ThesisScenario = {
  id: string;
  thesisId: string;
  label: "Base case" | "Bull case" | "Bear case";
  probability: number;
  confirmation: string;
  marketConsequence: string;
};

export type ThesisUpdate = {
  id: string;
  thesisId: string;
  timestamp: string;
  text: string;
};

export type Position = {
  id: string;
  symbol: string;
  side: "long" | "short";
  linkedThesisId: string;
  thesisStatus: ThesisStatus;
  recommendation: AdvisoryAction;
  probability: number;
  latestUpdate: string;
};

export type RelatedAsset = {
  symbol: string;
  note: string;
};

export type FeedSignal = {
  id: string;
  source: string;
  timestamp: string;
  headline: string;
  summary: string;
  linkedThesisSlug?: string;
  linkedThesisTitle?: string;
};

export type WatchlistIdea = {
  id: string;
  symbol: string;
  thesisTitle: string;
  thesisSlug: string;
  note: string;
};

export type ThesisDetailBundle = {
  thesis: Thesis;
  evidence: ThesisEvidence[];
  scenarios: ThesisScenario[];
  advisoryLog: ThesisUpdate[];
  relatedAssets: RelatedAsset[];
};

export type ResolvedThesisRecord = {
  id: string;
  title: string;
  asset: string;
  openedDate: string;
  closedDate: string;
  maxProbabilityPath: string; // e.g. "41% → 67% → 82%"
  result: string; // e.g. "+4.2R"
  duration: string; // e.g. "9 days"
};

export type TrackRecordMetrics = {
  winRate: string; // "62%"
  profitFactor: string; // "1.9"
  avgR: string; // "+1.6R"
  avgDuration: string; // "11 days"
  pctEverTradeable: string; // "48%"
};

export type LiveSignalTickerItem =
  | {
      id: string;
      kind: "thesis_update";
      source: string;
      timestamp: string;
      headline: string;
      thesisName: string;
      probabilityBefore: number;
      probabilityAfter: number;
      impact: "major_positive" | "minor_positive" | "neutral" | "minor_negative" | "major_negative";
    }
  | {
      id: string;
      kind: "building_new_thesis";
      source: string;
      timestamp: string;
      headline: string;
      topic: string;
    }
  | {
      id: string;
      kind: "catalogued";
      source: string;
      timestamp: string;
      headline: string;
      note: string;
    };
