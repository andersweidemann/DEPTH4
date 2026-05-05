export type ThesisStatus =
  | "watching"
  | "actionable"
  | "active"
  | "resolved"
  | "invalidated";

export type AdvisoryAction = "watch" | "enter" | "hold" | "reduce" | "exit";

export type Thesis = {
  id: string;
  slug: string;
  title: string;
  thesisStatement: string;
  asset: string;
  direction: "long" | "short" | "watch";
  probability: number;
  status: ThesisStatus;
  whyNow: string;
  whatsUnpriced: string;
  trigger: string;
  trade: string;
  invalidation: string;
  horizon: string;
  advisoryAction: AdvisoryAction;
  lastUpdated: string;
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
