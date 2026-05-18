/** Formal thesis resolution outcomes (DB + API). */

export type ThesisOutcomeKind =
  | "won_clean"
  | "won_messy"
  | "failed"
  | "expired"
  | "withdrawn"
  | "superseded";

export type ThesisOutcomeResolvedBy = "auto" | "manual" | "system";

export type MarketDirection = "up" | "down" | "neutral";

export interface ThesisOutcomeRecord {
  id: string;
  thesisId: string;
  thesisSlug: string;
  outcome: ThesisOutcomeKind;
  resolvedAt: string;
  resolvedBy: ThesisOutcomeResolvedBy;
  resolvedPrice: number | null;
  predictedDirection: "up" | "down";
  actualDirection: MarketDirection | null;
  convictionAtStart: number | null;
  convictionAtEnd: number | null;
  holdDurationDays: number | null;
  pnl: number | null;
  maxDrawdown: number | null;
  catalyst: string | null;
  reflection: string | null;
  createdAt: string;
}

export interface TrackRecordCategoryRow {
  category: string;
  total: number;
  won: number;
  winRate: number;
}

export interface TrackRecordMonthRow {
  month: string;
  won: number;
  failed: number;
  expired: number;
}

export interface TrackRecordResolvedThesisRow {
  thesisId: string;
  slug: string;
  title: string;
  asset: string;
  direction: string;
  outcome: ThesisOutcomeKind;
  resolvedAt: string;
  holdDurationDays: number | null;
  pnl: number | null;
}

export interface TrackRecord {
  total: number;
  wonClean: number;
  wonMessy: number;
  failed: number;
  expired: number;
  withdrawn: number;
  superseded: number;
  winRate: number;
  avgHoldDuration: number | null;
  byCategory: TrackRecordCategoryRow[];
  monthlyHistory: TrackRecordMonthRow[];
  resolvedTheses: TrackRecordResolvedThesisRow[];
}

export const THESIS_OUTCOME_LABELS: Record<ThesisOutcomeKind, string> = {
  won_clean: "Won cleanly",
  won_messy: "Won messily",
  failed: "Failed",
  expired: "Expired",
  withdrawn: "Withdrawn",
  superseded: "Superseded",
};

export const RESOLVABLE_OUTCOMES: ThesisOutcomeKind[] = [
  "won_clean",
  "won_messy",
  "failed",
  "expired",
];
