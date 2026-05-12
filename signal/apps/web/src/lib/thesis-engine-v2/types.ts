import type { ThesisDepthBook } from "@/lib/thesis-engine-v2/thesis-depth-canonical";

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
 * DEPTH4 thesis **book** — canonical narrative fields (shipped catalog baseline, `public.theses.body` JSON, or AI output).
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
  /** Full hero trade sentence (same voice as `title`; may be slightly longer than display title). No literal headline % here — Thesis conviction is UI-only. */
  thesisStatement: string;
  /**
   * Optional 3–4 short paragraphs for “Why this thesis exists” (catalog + rich user drafts).
   * Separate paragraphs with a blank line (`\\n\\n`). When absent, the detail page falls back
   * to driver / path / trade-expression cards without duplicating Market misread.
   */
  whyThesisExists?: string;
  asset: string;
  direction: "long" | "short" | "watch";
  /**
   * Legacy “hero / book” dial (0–100). **Not** the canonical user-facing thesis conviction.
   * Headline conviction = Clean + Messy from `scenarioOverrides` / fallbacks — use
   * `displayConvictionPctFromEngineThesis` or `getThesisDisplayModel` in UI; `thesisWithSyncedLiveProbability`
   * may sync this field to match path conviction after merges.
   */
  probability: number;
  status: ThesisStatus;
  probabilityRationale: string;
  /**
   * Client/session lane hint (system vs user via sessionStorage). Not the same as DB `public.theses.thesis_origin`.
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

  /**
   * Canonical four-depth book (0–24h → 1–7d → 7–30d → 30–90d+). When set, mispricing/trade selection should
   * derive from these nodes — see `thesis-depth-canonical.ts`. Legacy `thesisCascade` prose remains until migrated.
   */
  thesisDepthBook?: ThesisDepthBook;

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

  /**
   * Optional user-authored resolution paths (user theses). Storage keys only:
   * `base` → messy win, `bull` → clean win, `bear` → thesis broken (matches `scenario_probabilities` in Supabase).
   */
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

/** Live-derived trade levels (estimated from spot + ATR); not billed broker orders. */
export type LiveTradePlan = {
  ready: boolean;
  entry_zone: { min: number | null; max: number | null; mid: number | null };
  stop: number | null;
  target1: number | null;
  target2: number | null;
  /** When true, conviction was below the minimum bar for publishing entry geometry. */
  conviction_blocked?: boolean;
  /** Reward:risk to target1 from entry-zone midpoint; null if not computable. */
  rr_to_target1?: number | null;
  /** Policy minimum R/R for the conviction bucket when `convictionPct` was supplied to the engine. */
  min_rr_for_conviction?: number | null;
  /** Meets `min_rr_for_conviction` when both are known. */
  rr_check_ok?: boolean | null;
  /** Human-readable R/R check line for Trade plan UI. */
  rr_check_label?: string | null;
  /** Raw levels do not meet minimum R/R for this conviction — user should adjust stops/targets. */
  levels_need_adjustment?: boolean | null;
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
  /**
   * When false, the log row had no stored `probability_after` JSON — UI should not imply a modeled before→after shift.
   * Omitted on static bundle rows (treated like a complete narrative line).
   */
  logScenarioAfterStored?: boolean;
};

export type ThesisScenarioPathKey = "clean_win" | "messy_win" | "thesis_broken";

/** How this single long/short thesis can resolve (not parallel alternate trades). */
export type ThesisScenario = {
  id: string;
  thesisId: string;
  pathKey: ThesisScenarioPathKey;
  label: "Clean win" | "Messy win" | "Thesis broken";
  probability: number;
  /** Narrative: how the world looks if this path plays out. */
  confirmation: string;
  /** What it means for the current trade (size, targets, invalidation, Book). */
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
  /** Card snapshot / mock leaderboard field — **not** DEPTH4 path conviction (Clean + Messy). */
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
