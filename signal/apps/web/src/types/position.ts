export interface Position {
  id: string;
  thesisSlug: string;
  thesisTitle: string;
  direction: "long" | "short";
  status: "open" | "closed" | "stopped";
  entryPrice: number;
  exitPrice?: number;
  pnl?: number;
  pnlPercent?: number;
  openedAt: string;
  closedAt?: string;
  session: "browser" | "synced";
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
  direction: "long" | "short";
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
