/** View model for the four-depth feed (DEPTH4). Internal fields remain layer2|3|4. */

export type Sl = 1 | 2 | 3 | 4;

export type CausalStep = {
  title: string; // e.g. "Event", "Why", "Next"
  text: string;
};

/** Is this step’s story already in the market price, or is there “edge” left? */
export type PricedInLevel = "not_priced_in" | "partial" | "priced_in" | "unknown";

/** One example name the model links to this step (illustration; not a recommendation). */
export type PlyStockIdea = {
  ticker: string;
  note: string;
  /**
   * 1–100: approximate share of this headline / this Depth already reflected in the symbol (model or heuristic).
   * `null` when the engine could not score it.
   */
  newsPricedInPct: number | null;
};

/** One link in the serial 4-ply “transmission” chain (consequence engine). */
export type TransmissionPly = {
  step: number;
  from_state: string;
  mechanism: string;
  to_state: string;
  time_to_effect: string;
  lead_indicator: string;
  /** Whether this move is already reflected in prices (stronger for steps 2–4). */
  pricedIn: PricedInLevel;
  /** 0–3 US tickers this step points at; heavier on steps 2–4 in the prompt. */
  stockIdeas: PlyStockIdea[];
  /** Plain-English: what to wait for before acting on the names above. */
  buyTrigger: string;
};

export type LeadTrafficLight = "red" | "yellow" | "green";

export type LeadListItem = {
  text: string;
  /** Model hint; user override is **per-device** (`localStorage` in feed UI), not synced to account. */
  light: LeadTrafficLight;
};

export type FeedLayer2 = {
  anchorHeadline: string;
  /** Vertical chain, order matters */
  chain: CausalStep[];
  verdict: string; // one large sentence
  /** Structured Depth 1 (LLM) when present in forward_model */
  depth1?: {
    event?: string;
    whyItMatters?: string;
    firstMove?: string;
    pricedIn?: string;
  };
  /** Structured Depth 2 (LLM) when present in forward_model */
  depth2?: {
    sectorRipple?: string;
    timeline?: { step?: string; impact?: string; watch?: string }[];
    crossAsset?: string;
  };
  /** Shared backbone: furthest-ahead serial reasoning (4 plies) when tree has forward_model */
  transmissionPlies?: TransmissionPly[];
  /** Replaces string-only “lead” chips: text + red/yellow/green from model, user can update */
  earlyLeadList?: LeadListItem[];
  forwardHorizonSummary?: string;
};

export type FeedScenario3 = {
  id: string;
  label: string;
  probability: number;
  outcome: string; // up to 2 sentences shown as one block
  marketImpact: string; // e.g. "Brent +$4–6 · S&P -0.8% · DXY +0.3%"
  winners: string[];
  losers: string[];
  oneWatch: string; // "Confirmed if: …"
};

export type WatchListTrigger3 = {
  kind: "confirmA" | "activateC" | "wait";
  line: string; // full line after "If [X] → …"
};

export type FeedLayer3 = {
  scenarios: FeedScenario3[];
  watchList: WatchListTrigger3[];
};

export type PosImpactRow4 = {
  position: string; // "FCX"
  valueSek: string; // "23,864"
  impactScenarioA: string; // "+2,100 SEK" or "TBD"
  impactScenarioC: string;
  action: string; // "HOLD" + optional emoji
};

export type OpenOrderBlock4 = {
  summary: string; // "VLO buy limit $220"
  distanceLine: string; // "5.9% away"
  scenarioA: { situation: string; rec: string };
  scenarioC: { situation: string; rec: string };
};

export type WatchCandidate4 = {
  line: string; // full line with ticker, level, context
};

/** Classifier output surfaced on the card (from news_events.raw_json). */
export type FeedVerification = {
  status: "confirmed" | "unconfirmed" | "unknown";
  basis?: string;
  lastKnownDateHint?: string | null;
  flagForUser?: string | null;
};

/** Consequence engine: each open order vs scenario matrix (from forward_model). */
export type OrderBookReviewRow = {
  ticker: string;
  direction?: string;
  limitPrice?: number | null;
  stance: string;
  rationale: string;
};

/** Consequence engine: 1–3 names not in the book, tied to a Depth step. */
export type OutsideDepotIdea = {
  ticker: string;
  side: string;
  rationale: string;
  linkedDepth: number;
  whyOutsideBook: string;
};

export type FeedLayer4 = {
  positions: PosImpactRow4[];
  orders: OpenOrderBlock4[];
  watchlist: WatchCandidate4[];
  /** false when not logged in / demo */
  isPersonalized: boolean;
  /** When present, prefer these over generic order blocks in L4 panel */
  orderBookReview?: OrderBookReviewRow[];
  outsideDepotIdeas?: OutsideDepotIdea[];
};

export type FeedViewModel = {
  id: string;
  source: string;
  signalLevel: Sl;
  headline: string;
  /** Max ~12 words, opinionated */
  hook: string;
  /** User portfolio tickers that appear in event's affected list */
  affectedUserTags: string[];
  layer2: FeedLayer2;
  layer3: FeedLayer3;
  layer4: FeedLayer4 | null;
  /** L4 push copy = hook (Depth 1 one-liner) */
  notificationText: string;
  /** From classify raw_json when present */
  verification?: FeedVerification | null;
};
