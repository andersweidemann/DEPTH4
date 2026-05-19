import type { EventCategory, TimeDepth, AssetDepth, CausalAsset, CausalThesis, ThesisCluster } from "@/types/causal-graph";
import type { IncentiveAnalysis } from "@/types/incentive-analysis";
import type { QualityReport } from "@/lib/thesis/quality-gate";

export type PipelineNewsItem = {
  headline: string;
  source: string;
  timestamp: string;
  summary: string;
};

export interface PipelineContext {
  newsItems: PipelineNewsItem[];
  existingTheses: CausalThesis[];
  existingClusters: ThesisCluster[];
  marketData: Record<string, { price: number; change24h: number; volume: number }>;

  detectedEvent?: DetectedEvent;
  incentiveAnalysis?: IncentiveAnalysis;
  causalPropagation?: CausalPropagationResult;
  candidateThesis?: ThesisCandidate;

  finalThesis?: CausalThesis;
  qualityReport?: QualityReport;
}

export interface DetectedEvent {
  title: string;
  category: EventCategory;
  description: string;
  confidence: number;
  sourceHeadlines: string[];
  firstDetected: string;
}

export type AffectedAssetPropagation = {
  asset: CausalAsset;
  direction: "up" | "down" | "neutral";
  strength: number;
  pricedInPercent: number;
  mispricingScore: number;
  timeDepth: TimeDepth;
  assetDepth: AssetDepth;
  reasoning: string;
};

export interface CausalPropagationResult {
  rootAsset: CausalAsset;
  affectedAssets: AffectedAssetPropagation[];
  highestMispricing: AffectedAssetPropagation | null;
}

export interface TradePlan {
  entryZone: string;
  stop: string;
  target1: string;
  target2: string;
}

export interface ResolutionPaths {
  clean: string;
  messy: string;
  broken: string;
}

export interface ThesisCandidate {
  title: string;
  statement: string;
  direction: "up" | "down";
  targetAssetSymbol: string;
  targetAssetName: string;
  conviction: number;
  mispricingScore: number;
  timeHorizon: string;
  tradePlan: TradePlan;
  evidence: Array<{ date: string; source: string; excerpt: string; url?: string | null }>;
  resolutionPaths: ResolutionPaths;
}

export type PipelineFailureReason =
  | "missing_llm"
  | "event_detection_failed"
  | "incentive_analysis_failed"
  | "incentive_confidence_too_low"
  | "causal_propagation_failed"
  | "no_mispricing_found"
  | "thesis_generation_failed"
  | "quality_gate_failed"
  | "save_failed"
  | "render_verification_failed"
  | "pipeline_error";

export type PipelineResult =
  | { success: true; thesisId: string; slug: string; context: PipelineContext }
  | {
      success: false;
      reason: PipelineFailureReason;
      context: PipelineContext;
      report?: QualityReport;
      error?: string;
    };

export const INCENTIVE_CONFIDENCE_MIN = 40;
export const MISPRICING_SCORE_MIN = 20;
