/** Unified feed row for `/feed` — conviction changes, promoted reasoning, and raw headlines. */
export interface FeedItem {
  id: string;
  type: "reasoning" | "headline" | "conviction_change";
  source: string;
  headline: string;
  /** ISO 8601 for sorting and day grouping; formatted in the client for display. */
  timestamp: string;
  signalLevel: number;
  thesisSlug: string | null;
  thesisTitle: string | null;
  thesisAsset: string | null;
  thesisDirection: "short" | "long" | null;
  oldConviction: number | null;
  newConviction: number | null;
  changeDirection: "up" | "down" | null;
  /** One-line: what this means for the thesis. */
  summary: string;
  /** Optional longer reasoning (collapsed by default for `reasoning`). */
  body?: string;
  linkedThesisSlug: string | null;
  linkedThesisTitle: string | null;
  /**
   * When no catalog/AI thesis link yet: provisional line from macro reasoning (not endorsed, not trade-ready).
   */
  formingNarrative?: string | null;
}

/** @deprecated Legacy feed card — prefer {@link FeedItem}. */
export interface NewsEvent {
  id: string;
  source: string;
  headline: string;
  timestamp: string;
  signalLevel?: number;
  linkedThesisSlug: string | null;
  linkedThesisTitle: string | null;
  reasoning?: string;
}

export interface FeedContext {
  title: string;
  description: string;
  note: string;
  sources: string[];
}

/** @deprecated Prefer `GET /api/feed` returning {@link FeedItem}[]. */
export interface FeedResponse {
  events: NewsEvent[];
  promotedReasoning: NewsEvent[];
  context: FeedContext;
}
