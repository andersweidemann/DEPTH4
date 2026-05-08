export type InsiderFlowPatternType = "BULL_LEAK" | "BEAR_LEAK";
export type InsiderFlowStatus = "UNCONFIRMED_LEAK" | "CONFIRMED_MOVE" | "INVALIDATED";

export type InstrumentFlowSnapshot = {
  symbol: string;
  return_1m: number;
  return_5m: number;
  return_15m: number;
  volume_30m: number;
  baseline_volume_30m: number;
  volume_multiple: number;
  z_score: number;
};

export type InsiderFlowAnomaly = {
  id: string;
  createdAt: number;
  thesisId: string;
  thesisTitle: string;
  patternType: InsiderFlowPatternType;
  status: InsiderFlowStatus;
  instrumentsMoved: InstrumentFlowSnapshot[];
  matchedTags: string[];
  confirmedHeadlineAt?: number;
  invalidatedAt?: number;
  statusReason?: string;
  notes?: string;
};

export type InsiderFlowDetectionInput = {
  nowMs: number;
  thesisId: string;
  thesisTitle: string;
  bullInstruments: string[];
  bearInstruments: string[];
  confirmTags: string[];
  /** Recent headlines to check for confirm-tags. */
  recentHeadlines: Array<{ headline: string; atMs: number }>;
  /** Market snapshots keyed by symbol. */
  market: Record<string, InstrumentFlowSnapshot | undefined>;
};

