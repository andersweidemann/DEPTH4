export type PositionDirection = "long" | "short";
export type PositionStatus = "open" | "closed" | "stopped";
export type PositionSession = "browser" | "synced";

export interface Position {
  id: string;
  thesisSlug: string;
  thesisTitle: string;
  direction: PositionDirection;
  status: PositionStatus;
  entryPrice: number;
  exitPrice?: number;
  pnl?: number;
  pnlPercent?: number;
  openedAt: string;
  closedAt?: string;
  session: PositionSession;
}

export interface PositionStats {
  totalOpen: number;
  totalClosed: number;
  totalPnL: number;
  winRate: number;
  avgWinPercent: number;
  avgLossPercent: number;
  avgHoldDuration: string;
}

export interface WatchlistItem {
  thesisSlug: string;
  thesisTitle: string;
  asset: string;
  direction: PositionDirection;
  status: "Ready" | "Active" | "Watching";
  conviction: number;
  lastUpdated: string;
}

export interface ResolvedThesis {
  thesisSlug: string;
  thesisTitle: string;
  outcome: "resolved" | "invalidated";
  resolvedAt: string;
}

export interface BookResponse {
  positions: Position[];
  stats: PositionStats;
  watchlist: WatchlistItem[];
  resolved: ResolvedThesis[];
}
