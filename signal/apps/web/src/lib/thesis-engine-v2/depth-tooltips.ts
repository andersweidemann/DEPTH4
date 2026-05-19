/** Shared hover copy for DEPTH4 depth labels and map/thesis metrics. */

export const DEPTH_TOOLTIPS = {
  d1: "Depth 1 — Confirmed now: what Tier 1–2 sources verify and the immediate tape reaction.",
  d2: "Depth 2 — This week: transmission path, positioning, and the first market move.",
  d3: "Depth 3 — This month: portfolio mechanics — who rebalances, what they unwind, and why it hits this asset.",
  d4: "Depth 4 — This quarter: regime shift — how the macro backdrop and cross-asset pricing change.",
  fourDepthChain: "Four-depth chain: confirmed facts → mechanism → portfolio mechanics → regime shift.",
} as const;

export const MAP_TOOLTIPS = {
  qualityScore:
    "Quality score (0–100): incentive depth, causal chain, trade plan, evidence, and resolution paths.",
  conviction: "Conviction: probability the thesis is correct based on reasoning quality.",
  edge: "Edge (mispricing): how much of the expected move is not yet priced in. Higher = more edge.",
  directionUp: "Bullish — thesis expects price to rise.",
  directionDown: "Bearish — thesis expects price to fall.",
  assetSymbol: "Primary instrument this thesis trades.",
  showConflicts:
    "Show only theses that conflict with another thesis in the same cluster or isolated group (opposite direction on the same asset).",
  hidePricedIn: "Hide thesis cards where more than 70% of the expected move is already priced in.",
  clusterEvent: "Macro event this thesis cluster is linked to in the causal graph.",
} as const;

export const THESIS_DETAIL_TOOLTIPS = {
  incentiveHeader: "Who must act, under what constraint, and the most likely path — before price moves.",
  actor: "The institution or leader whose incentives drive the trade.",
  goal: "What they must achieve politically or economically.",
  constraint: "What blocks the easy path — forces a specific action.",
  invalidation: "What observable fact or price level proves the thesis wrong — stand down here.",
  resolutionPaths: "Three futures: clean win, messy win, or thesis broken — with path probabilities.",
  resolutionClean: "Clean win: thesis plays out as written with limited noise.",
  resolutionMessy: "Messy win: direction right but path noisy — size and timing matter.",
  resolutionBroken: "Broken: invalidation scenario — exit or hedge.",
  qualityScore:
    "Quality score (0–100): combines incentive analysis, causal depth, trade plan, evidence, and resolution paths.",
  tradePlan: "Actionable entry, stop, and targets — updated as evidence and volatility shift.",
  evidenceItem: "Headline or data point tied to this thesis; may move conviction or path odds.",
} as const;

export const FEED_TOOLTIPS = {
  crossThesisSeverity:
    "Cross-thesis alert: conflict (⚠ opposing views), opportunity (★ related edge), or info (context).",
  activeConnections: "Number of live cross-thesis relationships in your starred book.",
} as const;
