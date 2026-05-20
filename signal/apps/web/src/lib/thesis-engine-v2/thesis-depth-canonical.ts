/**
 * DEPTH4 canonical **four-depth** book — single engine for thesis page, macro reasoning, and (eventually) homepage copy.
 *
 * ## Product rule
 * Mispricing and **primary trade expression** are **derived** from depth nodes, not from a separate “Mispricing level”
 * on the homepage or from generic hero prose alone. The **best trade may not be the headline asset** (e.g. Hormuz:
 * L2 crude may reprice violently while the cleaner edge is L3 fertilizer / airlines / EM importers).
 *
 * ## Timeframes (canonical)
 * - depth_1: Confirmed / now — **0–24h**
 * - depth_2: Direct move — **1–7d**
 * - depth_3: Second-order spillover — **7–30d**
 * - depth_4: Third-order / systemic — **30–90d+**
 *
 * ## Canonical Hormuz example (closed Strait after clash)
 * **Event:** “Iran closes the Strait of Hormuz after a military clash.”
 *
 * - **L1 claim:** Hormuz traffic disruption is verified by Tier 1 sources.
 * - **L2 claim:** Front crude, tanker rates, and shipping insurance jump.
 * - **L3 claim:** Higher energy costs feed into diesel, fertilizer, ag inputs, airline margins, EM importer stress.
 * - **L4 claim:** Sticky inflation delays cuts, strengthens energy exporters/defense, hurts importers and duration.
 *
 * **Trade implication:** Primary edge might be **L3 or L4** (e.g. long fertilizer producers / short airlines;
 * long energy exporters / short EM importers; underweight duration) — **not** automatically “long oil” if L2 is
 * already violently repriced.
 */

/** Canonical depth keys — use these everywhere (DB, prompts, UI). */
export const THESIS_DEPTH_KEYS = ["depth_1", "depth_2", "depth_3", "depth_4"] as const;
export type ThesisDepthKey = (typeof THESIS_DEPTH_KEYS)[number];

export const THESIS_DEPTH_TIMEFRAMES: Record<ThesisDepthKey, { label: string; hoursMin: number; hoursMax: number | null }> =
  {
    depth_1: { label: "0–24h · Confirmed / now", hoursMin: 0, hoursMax: 24 },
    depth_2: { label: "1–7d · Direct move", hoursMin: 24, hoursMax: 24 * 7 },
    depth_3: { label: "7–30d · Second-order spillover", hoursMin: 24 * 7, hoursMax: 24 * 30 },
    depth_4: { label: "30–90d+ · Third-order / systemic", hoursMin: 24 * 30, hoursMax: null },
  };

export type DepthExpectedDirection = "bullish" | "bearish" | "mixed" | "neutral";

/**
 * One causal future-state node. All fields should be populated over time; generation may start with `claim` +
 * `timeframe` + `confidence` and fill pricing gaps heuristically.
 */
export type ThesisDepthNode = {
  /** Stable id (e.g. depth_2) — redundant with map key but useful for JSON arrays. */
  id: ThesisDepthKey;
  /** Single sharp causal claim for this depth. */
  claim: string;
  /** Human-readable window; should match canonical timeframe for the level unless event-specific. */
  timeframe: string;
  /** 0–1 DEPTH4 confidence this claim is directionally right conditional on parent chain. */
  confidence: number;
  /** Bullet citations: headlines, prints, analyst notes, or “see thesis evidence log id …”. */
  evidence: string[];
  /** Short note on what must be true at the prior level for this to matter (empty at L1). */
  dependencyOnPriorLevel: string;
  /** Tickers / sectors affected at this depth (not only the hero asset). */
  affectedAssets: string[];
  /** Expected directional lean for the **primary** expression at this depth (may differ from hero). */
  expectedDirection: DepthExpectedDirection;
  /**
   * Observable series the model uses as “market view” proxies (curve point, spread, ETF, realized vol, etc.).
   * Heuristic v1: labels only; v2: optional instrument ids for data wiring.
   */
  candidateMarketProxies: string[];
  /** Qualitative: what consensus / price action already embeds at this depth. */
  whatMarketProbablyPricesNow: string;
  /** DEPTH4 view that differs (can be qualitative probability sentence until calibrated). */
  whatDepth4ThinksIsMoreLikely: string;
  /** Why the gap exists — flow, lag, attention, policy blind spot, etc. */
  whyTheGapExists: string;
};

/**
 * Per-depth mispricing slice. v1 allows heuristic / LLM-filled numbers; v2 can bind `market_implied_probability`
 * to proxy-implied odds when data exists.
 */
export type ThesisDepthMispricing = {
  depthId: ThesisDepthKey;
  /** P(this depth’s claim / outcome), DEPTH4, 0–1. */
  depth4Probability: number;
  /**
   * P(same), from market proxy interpretation — null when not yet estimated.
   * Start: null + qualitative `market_proxy_assessment` only.
   */
  marketImpliedProbability: number | null;
  /** market_proxy_assessment text when numeric implied prob unavailable. */
  marketProxyAssessment: string;
  /** depth4 − market (if both numeric); else null. */
  gap: number | null;
  /** gap × confidence weighting (or similar) — heuristic. */
  confidenceAdjustedGap: number | null;
  /** How clear the next catalyst is for this depth (0–1). */
  catalystClarity: number;
  /** How cleanly the edge is expressible in liquid instruments (0–1). */
  expressibility: number;
};

export type ThesisDepthBook = {
  version: 1;
  nodes: Record<ThesisDepthKey, ThesisDepthNode>;
  mispricingByDepth: Record<ThesisDepthKey, ThesisDepthMispricing>;
  /** ISO timestamp or "catalog-v1" when hand-authored. */
  lastComputedAt: string;
};

/** Output of trade selection — **not** always hero asset / direction. */
export type PrimaryTradeSelection = {
  primaryDepth: ThesisDepthKey;
  primaryScore: number;
  rationale: string;
  /** Optional second expression (hedge or paired book). */
  secondaryDepth?: ThesisDepthKey;
  secondaryScore?: number;
  /** User-facing line e.g. "Primary edge is D3, not the headline." */
  headlineFraming: string;
};

export type TradeabilityInputs = {
  mispricing: ThesisDepthMispricing;
  /** Typical realization horizon in hours (from depth definition or node-specific). */
  timeToRealizationHours: number;
  liquidityExpressibility: number;
  /** 0–1, higher = more sequential conditions / harder path. */
  pathDependency: number;
  /** 0–1 crowding / squeeze risk. */
  crowdingRisk: number;
  /** 0–1 how clear invalidation is for expressions at this depth. */
  invalidationClarity: number;
};

/**
 * Heuristic tradeability score (0–100). Tune weights as you calibrate.
 * Larger `confidenceAdjustedGap` and `expressibility` help; long horizon and path dependency hurt.
 */
export function tradeabilityScore(t: TradeabilityInputs): number {
  const gap = t.mispricing.confidenceAdjustedGap ?? t.mispricing.gap ?? 0;
  const gapPts = Math.max(0, Math.min(40, gap * 80));
  const expr = t.liquidityExpressibility * 25;
  const cat = t.mispricing.catalystClarity * 15;
  const inv = t.invalidationClarity * 10;
  const horizonPenalty = Math.min(15, Math.log1p(t.timeToRealizationHours / 24) * 4);
  const pathPen = t.pathDependency * 10;
  const crowdPen = t.crowdingRisk * 8;
  const raw = gapPts + expr + cat + inv - horizonPenalty - pathPen - crowdPen;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

/**
 * Pick primary (and optional secondary) depth for trade expression. Pure function over `ThesisDepthBook`.
 */
export function selectPrimaryTradeNode(book: ThesisDepthBook): PrimaryTradeSelection {
  const order: ThesisDepthKey[] = [...THESIS_DEPTH_KEYS];
  let best: { k: ThesisDepthKey; s: number } | null = null;
  let second: { k: ThesisDepthKey; s: number } | null = null;

  for (const k of order) {
    const node = book.nodes[k];
    const mp = book.mispricingByDepth[k];
    const tf = THESIS_DEPTH_TIMEFRAMES[k];
    const hoursMid =
      tf.hoursMax != null ? (tf.hoursMin + tf.hoursMax) / 2 : tf.hoursMin + 24 * 45;

    const s = tradeabilityScore({
      mispricing: mp,
      timeToRealizationHours: hoursMid,
      liquidityExpressibility: mp.expressibility,
      pathDependency: k === "depth_4" ? 0.35 : k === "depth_3" ? 0.25 : 0.15,
      crowdingRisk: k === "depth_2" ? 0.35 : 0.2,
      invalidationClarity: 0.5 + node.confidence * 0.3,
    });

    if (!best || s > best.s) {
      second = best;
      best = { k, s };
    } else if (!second || s > second.s) {
      second = { k, s };
    }
  }

  const primary = best!.k;
  const headlineFraming =
    primary === "depth_1"
      ? "Primary edge is at the confirmed / immediate layer — expression aligns with the headline path."
      : primary === "depth_2"
        ? "Primary edge is the direct 1–7d move — watch whether it is already priced in."
        : primary === "depth_3"
          ? "Primary edge is D3 (7–30d spillovers) — not only the first tape reaction."
          : "Primary edge is D4 (systemic 30–90d+) — expression targets backdrop repricing, not the spike.";

  let rationale = `${headlineFraming} Selected depth ${primary} with tradeability ${best!.s}/100.`;
  if (book.mispricingByDepth[primary].gap != null && book.mispricingByDepth[primary].gap! < 0.05) {
    rationale += " Note: numeric gap is small — may be priced; review proxy assessment.";
  }

  return {
    primaryDepth: primary,
    primaryScore: best!.s,
    secondaryDepth: second && second.s >= best!.s * 0.85 ? second.k : undefined,
    secondaryScore: second && second.s >= best!.s * 0.85 ? second.s : undefined,
    headlineFraming,
    rationale,
  };
}

/** Hormuz closed-strait chain for prompts, tests, and UI examples. */
export function exampleHormuzDepthBook(): ThesisDepthBook {
  const base = (id: ThesisDepthKey, claim: string, direction: DepthExpectedDirection): ThesisDepthNode => ({
    id,
    claim,
    timeframe: THESIS_DEPTH_TIMEFRAMES[id].label,
    confidence: id === "depth_1" ? 0.85 : id === "depth_2" ? 0.7 : id === "depth_3" ? 0.55 : 0.45,
    evidence: [],
    dependencyOnPriorLevel:
      id === "depth_1"
        ? ""
        : id === "depth_2"
          ? "Requires verified Strait disruption (L1)."
          : id === "depth_3"
            ? "Requires sustained high energy / freight stress from L2."
            : "Requires L3 cost pass-through into macro data and policy reaction function.",
    affectedAssets:
      id === "depth_1"
        ? ["USO", "WTI", "Brent", "tankers"]
        : id === "depth_2"
          ? ["USO", "VLCC rates", "shipping insurers"]
          : id === "depth_3"
            ? ["NTR", "CF", "UAL", "DAL", "EEM", "diesel crack"]
            : ["TLT", "HYG", "XLE", "UUP", "defense primes"],
    expectedDirection: direction,
    candidateMarketProxies:
      id === "depth_1"
        ? ["Brent front", "AIS ship tracking", "war risk insurance"]
        : id === "depth_2"
          ? ["front-spread", "FFAs", "clean-dirty tanker spreads"]
          : id === "depth_3"
            ? ["diesel crack", "fertilizer equities", "airline margins"]
            : ["Fed cuts priced", "breakevens", "EM FX vs USD"],
    whatMarketProbablyPricesNow:
      id === "depth_4"
        ? "Some repricing of cuts and risk; full inflation persistence less priced."
        : id === "depth_3"
          ? "First-order energy spike often priced faster than downstream margin pain."
          : id === "depth_2"
            ? "Front crude and headline risk often gap hard and fast."
            : "Geopolitical tail scenarios partially priced until confirmation.",
    whatDepth4ThinksIsMoreLikely:
      id === "depth_4"
        ? "Sticky inflation and delayed easing are under-appreciated vs energy shock fade narrative."
        : id === "depth_3"
          ? "Downstream margin compression and EM stress are under-owned vs flat price oil."
          : id === "depth_2"
            ? "Tanker/insurance squeeze can overshoot consensus baselines briefly."
            : "Closure is confirmed and durable enough to matter for routes, not a one-hour headline.",
    whyTheGapExists:
      id === "depth_2"
        ? "Attention anchors on flat price; microstructure of freight and insurance lags."
        : id === "depth_3"
          ? "Equity analysts lag commodity pass-through; sector dispersion hides losers."
          : id === "depth_4"
            ? "Policy path is modeled off headline CPI, not persistence from energy tax on growth."
            : "Verification lag vs Twitter noise.",
  });

  const nodes: Record<ThesisDepthKey, ThesisDepthNode> = {
    depth_1: base("depth_1", "Hormuz traffic disruption is verified by Tier 1 sources.", "bullish"),
    depth_2: base("depth_2", "Front crude, tanker rates, and shipping insurance jump.", "bullish"),
    depth_3: base(
      "depth_3",
      "Higher energy costs feed into diesel, fertilizer, ag inputs, airline margins, EM importer stress.",
      "mixed",
    ),
    depth_4: base(
      "depth_4",
      "Sticky inflation delays cuts, strengthens energy exporters/defense, hurts importers and duration.",
      "bearish",
    ),
  };

  const mispricingByDepth = {} as Record<ThesisDepthKey, ThesisDepthMispricing>;
  for (const k of THESIS_DEPTH_KEYS) {
    const d4 =
      k === "depth_1" ? 0.75 : k === "depth_2" ? 0.65 : k === "depth_3" ? 0.45 : 0.4;
    const mkt = k === "depth_2" ? 0.55 : k === "depth_3" ? 0.25 : k === "depth_4" ? 0.28 : 0.45;
    const gap = d4 - mkt;
    const node = nodes[k]!;
    mispricingByDepth[k] = {
      depthId: k,
      depth4Probability: d4,
      marketImpliedProbability: mkt,
      marketProxyAssessment: `Proxy-implied ~${Math.round(mkt * 100)}% (illustrative).`,
      gap,
      confidenceAdjustedGap: gap * node.confidence,
      catalystClarity: k === "depth_2" ? 0.85 : k === "depth_3" ? 0.55 : 0.5,
      expressibility: k === "depth_2" ? 0.9 : k === "depth_3" ? 0.65 : k === "depth_4" ? 0.5 : 0.7,
    };
  }

  return {
    version: 1,
    nodes,
    mispricingByDepth,
    lastComputedAt: "example-hormuz-v1",
  };
}

/**
 * Migration: prose-only legacy cascade → provisional structured book (low confidence outside `claim`).
 * Replace with LLM backfill or editorial review before relying on trade selection.
 */
/** Best-effort parse from `public.theses.body.thesis_depth_book` — returns undefined if invalid. */
export function parseThesisDepthBookFromUnknown(raw: unknown): ThesisDepthBook | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  if (o.version !== 1) return undefined;
  const nodes = o.nodes;
  const mp = o.mispricingByDepth;
  if (!nodes || typeof nodes !== "object" || !mp || typeof mp !== "object") return undefined;
  for (const k of THESIS_DEPTH_KEYS) {
    if (!(k in (nodes as object)) || !(k in (mp as object))) return undefined;
  }
  const lastComputedAt = typeof o.lastComputedAt === "string" ? o.lastComputedAt : "";
  return { version: 1, nodes: nodes as Record<ThesisDepthKey, ThesisDepthNode>, mispricingByDepth: mp as Record<ThesisDepthKey, ThesisDepthMispricing>, lastComputedAt };
}

export function migrateLegacyCascadeToDepthBook(cascade: {
  l1Confirmed: string;
  l2ThisQuarter: string;
  l3ThisYear: string;
  l4Backdrop2026: string;
}): ThesisDepthBook {
  const claims: Record<ThesisDepthKey, string> = {
    depth_1: cascade.l1Confirmed,
    depth_2: cascade.l2ThisQuarter,
    depth_3: cascade.l3ThisYear,
    depth_4: cascade.l4Backdrop2026,
  };

  const nodes = {} as Record<ThesisDepthKey, ThesisDepthNode>;
  const mispricingByDepth = {} as Record<ThesisDepthKey, ThesisDepthMispricing>;

  for (const k of THESIS_DEPTH_KEYS) {
    nodes[k] = {
      id: k,
      claim: claims[k] || "",
      timeframe: THESIS_DEPTH_TIMEFRAMES[k].label,
      confidence: 0.35,
      evidence: ["migrated_from_legacy_thesis_cascade"],
      dependencyOnPriorLevel:
        k === "depth_1" ? "" : `Inferred dependency on ${THESIS_DEPTH_KEYS[THESIS_DEPTH_KEYS.indexOf(k) - 1]}.`,
      affectedAssets: [],
      expectedDirection: "neutral",
      candidateMarketProxies: [],
      whatMarketProbablyPricesNow: "Unknown — backfill required.",
      whatDepth4ThinksIsMoreLikely: claims[k] || "",
      whyTheGapExists: "Unknown — backfill required.",
    };
    mispricingByDepth[k] = {
      depthId: k,
      depth4Probability: 0.5,
      marketImpliedProbability: null,
      marketProxyAssessment: "Not estimated — migrated from prose cascade only.",
      gap: null,
      confidenceAdjustedGap: null,
      catalystClarity: 0.35,
      expressibility: 0.35,
    };
  }

  return {
    version: 1,
    nodes,
    mispricingByDepth,
    lastComputedAt: "legacy-cascade-migration-v1",
  };
}
