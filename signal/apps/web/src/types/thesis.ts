export interface Thesis {
  slug: string;
  title: string;
  statement: string;
  summary: string;
  description: string;
  asset: string;
  direction: "short" | "long";
  status: "Ready" | "Active" | "Watching" | "Draft";
  tradeable: boolean;
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
  resolutionPaths: {
    cleanWin: { probability: number; whatHappens: string; tradeImpact: string };
    messyWin: { probability: number; whatHappens: string; tradeImpact: string };
    thesisBroken: { probability: number; whatHappens: string; tradeImpact: string };
  };
  fourLevelCascade: {
    l1: { timeframe: string; label: string; description: string };
    l2: { timeframe: string; label: string; description: string };
    l3: { timeframe: string; label: string; description: string };
    l4: { timeframe: string; label: string; description: string };
  };
  tradePlan: {
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
  };
  insiderFlow: {
    bullInstruments: string[];
    bearInstruments: string[];
    confirmTags: string[];
    contradictTags: string[];
  };
  relatedAssets: Array<{ symbol: string; type: "Primary" | "Secondary" }>;
  lastUpdated: string;
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
