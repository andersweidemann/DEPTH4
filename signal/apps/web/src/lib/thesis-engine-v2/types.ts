export type ThesisStatus =
  | "forming"
  | "watching"
  | "ready"
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

/**
 * DEPTH4 thesis **book** — canonical narrative fields (mock, `public.theses.body` JSON, or AI output).
 * **Single purpose:** do not paste the same idea into multiple blocks. Hero sentence lives in `title` /
 * `thesisStatement` only; what the market has not priced yet (the edge) once in `whatsUnpriced` (keep `marketMisread` empty when folded);
 * `trigger`, `trade`, `invalidation`, `timeStop` each once; `whyThesisExists` is framing only (3–4 short
 * paragraphs). `riskFactors` summarizes and references Invalidation, never duplicates full stand-down text.
 */
export type Thesis = {
  id: string;
  slug: string;
  /** Canonical display title — mirrors Supabase `public.theses.title` for catalog rows. */
  title: string;
  /**
   * Short 3–6 word human label above the title (`public.theses.micro_label` when synced).
   * No tickers, no factor jargon, not all-caps.
   */
  microLabel?: string | null;
  /** Optional one-sentence hook for a ~3-second scan (retail clarity). */
  oneLineSummary?: string;
  /** Full hero trade sentence (same voice as `title`; may be slightly longer than display title). */
  thesisStatement: string;
  /**
   * Optional 3–4 short paragraphs for “Why this thesis exists” (catalog + rich user drafts).
   * Separate paragraphs with a blank line (`\\n\\n`). When absent, the detail page falls back
   * to driver / path / trade-expression cards without duplicating Market misread.
   */
  whyThesisExists?: string;
  asset: string;
  direction: "long" | "short" | "watch";
  probability: number;
  status: ThesisStatus;
  probabilityRationale: string;
  /**
   * Client/session lane hint (mock + sessionStorage). Not the same as DB `public.theses.thesis_origin`.
   *
   * Phase 5 follow-up: align with DB enum `user | seeded_system | ai_generated` (e.g. map seeded catalog +
   * AI-discovered rows explicitly) before Discovered / fork UI ships.
   */
  origin?: "system" | "user";

  /**
   * Four-level cascade for the thesis **book** (not event L1–L4). Do not restate the hero title here.
   * L1 = facts now · L2 = near window / what to watch · L3 = how the trade pays through time · L4 = structural bias.
   */
  thesisCascade?: {
    l1Confirmed: string;
    l2ThisQuarter: string;
    l3ThisYear: string;
    l4Backdrop2026: string;
  };

  // causal framework (legacy cards when `whyThesisExists` absent)
  hiddenDriver: string;
  likelyPath: string;
  /** Prefer empty when misread is folded into `whatsUnpriced`; hero / feed may hide when blank. */
  marketMisread: string;
  tradeExpression: string;

  whyNow: string;
  /** Single “what the market hasn’t priced” / variant-perception block — not repeated in hero or cascade. */
  whatsUnpriced: string;
  /** Observable gate only — not a second copy of trade instructions. */
  trigger: string;
  /** What to do in words; numeric levels belong in Trade plan (`entryZone`, `stop`, `target*`). */
  trade: string;
  /** Canonical stand-down conditions — `riskFactors` references here instead of pasting. */
  invalidation: string;
  /** Optional: summarizes tail risks; must reference Invalidation, not duplicate its full text. */
  riskFactors?: string;
  /** Optional: clock on the thesis (e.g. downgrade if trigger never fires in N seasons). */
  timeStop?: string;
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

  /** Optional user-authored scenario framing (used for user theses). */
  scenarioOverrides?: {
    base: { probability: number; confirmation: string; marketConsequence: string };
    bull: { probability: number; confirmation: string; marketConsequence: string };
    bear: { probability: number; confirmation: string; marketConsequence: string };
  };

  /** Optional Insider Flow Detector configuration (enables monitoring). */
  insiderFlow?: {
    bullInstruments: string[];
    bearInstruments: string[];
    confirmTags: string[];
    /** Optional tags that contradict / invalidate the leak interpretation. */
    contradictTags?: string[];
  };
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

export type TradeStatus = "draft" | "open" | "closed" | "stopped" | "cancelled";

/** Why the user closed the book line (dummy, session-only). */
export type CloseReason =
  | "target_hit"
  | "stop_hit"
  | "manual_exit"
  | "thesis_weakened"
  | "thesis_invalidated";

export type Position = {
  id: string;
  symbol: string;
  side: "long" | "short";
  linkedThesisId: string;
  thesisStatus: ThesisStatus;
  tradeStatus: TradeStatus;
  openedAt: string; // ISO
  closedAt?: string; // ISO
  entryPrice?: number;
  exitPrice?: number;
  size?: number; // contracts/shares/units
  stopLoss?: number;
  takeProfit?: number;
  notes?: string;
  closeReason?: CloseReason;

  // dummy analytics (optional / best-effort)
  currentPnl?: string; // "+$120" / "-0.6R" / "—"
  realizedPnl?: string;
  /** Signed PnL in dummy points for session aggregates (win rate, averages). */
  realizedPnlNumeric?: number;
  /** Open-line mark-to-market in dummy points (Book performance). */
  unrealizedPnlNumeric?: number;

  recommendation: AdvisoryAction; // thesis stance (not trade status)
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
  /** Legacy body copy; omitted on feed scan cards when `thesisImpact` is set. */
  summary: string;
  linkedThesisSlug?: string;
  linkedThesisTitle?: string;
  /** Short line above hero title when linked to a catalog thesis. */
  linkedThesisMicroLabel?: string | null;
  /** Single scan-line impact (feed layer only; detail lives on thesis / reasoning). */
  thesisImpact?: string;
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

export type CommunityThesis = {
  id: string;
  thesisSlug: string; // opens /theses/[slug]
  title: string;
  /** Optional; when set, shown above `title` on cards. */
  microLabel?: string | null;
  author: string; // e.g. "@macro_maven"
  reputationBadge: string; // e.g. "Top 5% accuracy"
  probability: number;
  scoreTotal: number; // 0–100
  followers: number;
  lastUpdated: string; // e.g. "Updated 4h ago"
  status: "published" | "active" | "resolved";
};

export type LeaderboardUser = {
  id: string;
  rank: number;
  name: string; // e.g. "@macro_maven"
  badge: string; // e.g. "Top 5% accuracy"
  winRate: string; // "68%"
  resolvedCount: number;
  avgScore: string; // "82/100"
  followers: number;
};
