import type {
  FeedSignal,
  CommunityThesis,
  LeaderboardUser,
  Position,
  ResolvedThesisRecord,
  Thesis,
  ThesisDetailBundle,
  LiveSignalTickerItem,
  TrackRecordMetrics,
  WatchlistIdea,
} from "./types";

function clamp(n: number, a: number, b: number) {
  return Math.min(b, Math.max(a, n));
}

type ScoreParts = {
  driverStrength: number;
  timeCompression: number;
  marketMispricingScore: number;
  tradeClarityScore: number;
  triggerClarityScore: number;
};

function totalScore(s: ScoreParts) {
  return clamp(
    s.driverStrength + s.timeCompression + s.marketMispricingScore + s.tradeClarityScore + s.triggerClarityScore,
    0,
    100,
  );
}

function qualifyFromTotal(total: number): Thesis["qualification"] {
  if (total >= 65) return "tradeable";
  if (total >= 40) return "emerging";
  return "theme";
}

function withQualification(t: Omit<Thesis, "qualification" | "scores"> & { scores: ScoreParts }): Thesis {
  const total = totalScore(t.scores);
  const qualification = qualifyFromTotal(total);
  return { ...(t as Thesis), qualification, scores: { ...t.scores, total } };
}

const TID = {
  gold: "th-gold",
  hormuz: "th-hormuz",
  opec: "th-opec",
  tlt: "th-tlt",
  defense: "th-defense",
  qqq: "th-qqq",
  copper: "th-copper",
  euTech: "th-eutech",
} as const;

export const MOCK_THESES: Thesis[] = [
  withQualification({
    id: TID.gold,
    slug: "war-peace-gold-short",
    title: "WAR / PEACE — GOLD SHORT",
    thesisStatement:
      "De-escalation odds have moved into the tradeable zone; bullion is still priced for escalation tail-risk.",
    asset: "XAUUSD",
    direction: "short",
    probability: 67,
    status: "actionable",
    probabilityRationale:
      "Diplomatic track improved and risk proxies aren’t confirming the premium in gold; pricing looks late to unwind.",

    hiddenDriver: "Diplomacy is the real driver, not ‘risk sentiment’.",
    likelyPath: "Headline cadence shifts from escalation to negotiated sequencing; tail risk compresses first, then spot follows.",
    marketMisread: "The market still underprices de-escalation odds and overpays for escalation convexity in gold.",
    tradeExpression: "Fade the premium via XAUUSD/GLD; keep tight invalidation above the local high.",

    whyNow: "Peace probability crossed the threshold where premium should compress, but price hasn’t repriced.",
    whatsUnpriced: "The escalation premium is still embedded in spot and short-dated hedges.",
    trigger: "Second confirmation headline within 24h + risk proxies (oil/vol) stay calm.",
    trade: "Short 3285–3295 · Stop 3312 · TP 3180",
    invalidation: "New kinetic escalation or acceptance above 3312 that holds through the close.",
    horizon: "Days to weeks",
    advisoryAction: "enter",
    lastUpdated: "23m ago",
    theme: "geopolitics",
    scores: {
      driverStrength: 17,
      timeCompression: 20,
      marketMispricingScore: 18,
      tradeClarityScore: 12,
      triggerClarityScore: 14,
    },
    entryZone: "3285–3295",
    stop: "3312",
    target1: "3220",
    target2: "3180",
  }),
  withQualification({
    id: TID.hormuz,
    slug: "strait-hormuz-oil-long",
    title: "STRAIT OF HORMUZ RISK — OIL LONG",
    thesisStatement:
      "Transit risk is being priced like noise; the distribution has fattened and crude is late to reflect it.",
    asset: "USOIL",
    direction: "long",
    probability: 58,
    status: "active",
    probabilityRationale:
      "Chokepoint risk is rising faster than inventory/flow data is normalizing; the market is too anchored to spot balances.",

    hiddenDriver: "Chokepoint fragility (insurance, routing, and policy signaling).",
    likelyPath: "Friction shows up first in freight/insurance, then physical diffs, then flat price reprices abruptly.",
    marketMisread: "The market still prices a smooth flow regime; it’s a discontinuity risk.",
    tradeExpression: "Own upside convexity through crude exposure; keep defined risk and respect headline gaps.",

    whyNow: "The posture has shifted and routing chatter is real — this is when the curve misprices discontinuity.",
    whatsUnpriced: "The jump risk from a single incident is not reflected in flat price.",
    trigger: "Verified incident, restriction language, or sudden freight/insurance spike.",
    trade: "Long pullbacks toward 72.40–73.20 · Stop 70.80 · TP 78.50 / 81.00",
    invalidation: "Stand-down confirmation + flows normalize with no new incidents for a full week.",
    horizon: "Weeks",
    advisoryAction: "hold",
    lastUpdated: "1h ago",
    theme: "energy",
    scores: {
      driverStrength: 16,
      timeCompression: 18,
      marketMispricingScore: 15,
      tradeClarityScore: 10,
      triggerClarityScore: 12,
    },
    entryZone: "72.40–73.20",
    stop: "70.80",
    target1: "78.50",
    target2: "81.00",
  }),
  withQualification({
    id: TID.opec,
    slug: "opec-unity-fracturing",
    title: "OPEC UNITY FRACTURING — OIL VOLATILITY",
    thesisStatement:
      "The market is complacent about policy surprise; unity is weaker than the surface message.",
    asset: "USOIL",
    direction: "watch",
    probability: 44,
    status: "watching",
    probabilityRationale:
      "The incentive structure is diverging, but the timing catalyst is not tight enough yet.",

    hiddenDriver: "Political budget needs and compliance fatigue.",
    likelyPath: "Divergence leaks first; then meeting language surprises; then vol reprices faster than spot.",
    marketMisread: "Options still price ‘steady policy’ with low tail risk into meetings.",
    tradeExpression: "Prefer vol structures once timing compresses; avoid directional until meeting outcome is in hand.",

    whyNow: "The narrative is forming, but it’s not compressed into a tradeable window yet.",
    whatsUnpriced: "Vol risk into the next guidance window is too cheap for the uncertainty.",
    trigger: "Leak, dissent signal, or meeting prep headline that breaks the unity story.",
    trade: "Watch until trigger; then express via defined-risk vol (dummy).",
    invalidation: "Clean communique with credible enforcement and no dissent language.",
    horizon: "Months",
    advisoryAction: "watch",
    lastUpdated: "4h ago",
    theme: "energy",
    scores: {
      driverStrength: 14,
      timeCompression: 9,
      marketMispricingScore: 13,
      tradeClarityScore: 7,
      triggerClarityScore: 8,
    },
  }),
  withQualification({
    id: TID.tlt,
    slug: "fed-pivot-delayed-tlt-weakness",
    title: "FED PIVOT DELAYED — TLT WEAKNESS",
    thesisStatement:
      "The market still prices cuts too soon; duration is vulnerable before the Fed gives permission to rally.",
    asset: "TLT",
    direction: "short",
    probability: 61,
    status: "active",
    probabilityRationale:
      "Data keeps failing to deliver a clean disinflation glidepath; the curve’s optimism is the mispricing.",

    hiddenDriver: "Sticky services inflation + resilient labor keeps the Fed restrictive longer than futures price.",
    likelyPath: "Cuts get pushed stepwise; long duration sells first, then stabilizes when pricing matches reality.",
    marketMisread: "The market still underprices the probability of ‘no cut’ or ‘later cut’ quarters.",
    tradeExpression: "Sell/avoid long duration; express via TLT weakness with clear stop above key level.",

    whyNow: "The next two data prints can force a repricing; bond longs are early.",
    whatsUnpriced: "A later pivot path is still not fully priced in duration.",
    trigger: "Hot CPI/Payrolls or Fed language that explicitly pushes back on easing expectations.",
    trade: "Scale 92.50–93.80 adds · Stop 95.20 · TP 88.00",
    invalidation: "Clear disinflation regime shift or risk-off shock that forces duration bid.",
    horizon: "Weeks to months",
    advisoryAction: "hold",
    lastUpdated: "45m ago",
    theme: "rates",
    scores: {
      driverStrength: 16,
      timeCompression: 15,
      marketMispricingScore: 17,
      tradeClarityScore: 11,
      triggerClarityScore: 10,
    },
    entryZone: "92.50–93.80",
    stop: "95.20",
    target1: "90.00",
    target2: "88.00",
  }),
  withQualification({
    id: TID.defense,
    slug: "us-defense-repricing-rtx-lmt",
    title: "US DEFENSE REPRICING — RTX / LMT LONG",
    thesisStatement:
      "Backlog visibility is improving; multiples still reflect yesterday’s uncertainty.",
    asset: "RTX",
    direction: "long",
    probability: 55,
    status: "actionable",
    probabilityRationale:
      "Contract cadence and appropriations language are turning into numbers; the market is still trading vibes.",

    hiddenDriver: "Appropriations + award cadence, not the daily headline cycle.",
    likelyPath: "Awards convert to backlog → guide confidence improves → multiples re-rate on visibility.",
    marketMisread: "The market still prices ‘headline risk’ instead of backlog math.",
    tradeExpression: "Own primes where backlog converts cleanly; use defined risk around key support.",

    whyNow: "The awards are close enough to pull forward the re-rating window.",
    whatsUnpriced: "Visibility into outyear cash flows isn’t reflected in current multiples.",
    trigger: "Named contract awards + guide affirmation; supply chain commentary stays stable.",
    trade: "RTX 128–132 accumulation · Stop 123 · TP 148",
    invalidation: "Major program slip or funding shock.",
    horizon: "Months",
    advisoryAction: "enter",
    lastUpdated: "12m ago",
    theme: "geopolitics",
    scores: {
      driverStrength: 14,
      timeCompression: 12,
      marketMispricingScore: 14,
      tradeClarityScore: 10,
      triggerClarityScore: 9,
    },
    entryZone: "128–132",
    stop: "123",
    target1: "140",
    target2: "148",
  }),
  withQualification({
    id: TID.qqq,
    slug: "ai-capex-squeeze-qqq-rotation",
    title: "AI CAPEX SQUEEZE — QQQ ROTATION",
    thesisStatement:
      "The market is still pricing AI spend as free; the bill hits margins before revenue catches up.",
    asset: "QQQ",
    direction: "watch",
    probability: 49,
    status: "watching",
    probabilityRationale:
      "Narrative is real but the timing isn’t compressed — needs an earnings catalyst to become tradeable.",

    hiddenDriver: "Capex intensity vs monetization lag.",
    likelyPath: "Guides rise → margins wobble → dispersion widens → index leadership rotates.",
    marketMisread: "Index pricing still assumes smooth AI monetization with minimal margin cost.",
    tradeExpression: "Wait for the print; then rotate into cash-flow quality and away from capex-heavy laggards (dummy).",

    whyNow: "The setup is forming into earnings — but it isn’t a ‘now’ trade without confirmation.",
    whatsUnpriced: "Dispersion risk is underpriced at the index level.",
    trigger: "Two consecutive prints show margin pressure or demand softness tied to AI spend.",
    trade: "Wait for trigger; then rotate / reduce beta (dummy).",
    invalidation: "AI revenue acceleration beats broadly and margins expand despite capex.",
    horizon: "Quarters",
    advisoryAction: "watch",
    lastUpdated: "3h ago",
    theme: "equities",
    scores: {
      driverStrength: 13,
      timeCompression: 8,
      marketMispricingScore: 12,
      tradeClarityScore: 7,
      triggerClarityScore: 7,
    },
  }),
  withQualification({
    id: TID.copper,
    slug: "china-stimulus-copper-long",
    title: "CHINA STIMULUS REACCELERATION — COPPER LONG",
    thesisStatement:
      "The market is still priced for ‘slow China’; policy impulse is turning and copper is late to it.",
    asset: "HG",
    direction: "long",
    probability: 52,
    status: "actionable",
    probabilityRationale:
      "Policy tone + early HF data suggest impulse stabilization; copper pricing still reflects the prior regime.",

    hiddenDriver: "Policy impulse (credit + fiscal) turning from defense to support.",
    likelyPath: "Impulse turns → industrial proxies firm → inventories draw → copper reprices the growth tail.",
    marketMisread: "The market still anchors to ‘slow China’ and underprices a policy-led growth uptick.",
    tradeExpression: "Own copper in a defined zone; add on confirmation via inventory draw and HF demand prints.",

    whyNow: "The impulse is turning while the market is still anchored to the last quarter’s narrative.",
    whatsUnpriced: "A reacceleration path isn’t reflected in copper risk premium.",
    trigger: "Inventory draw + credit impulse confirmation in two consecutive reads.",
    trade: "Long HG 4.12–4.18 zone · Stop 3.98 · TP 4.45",
    invalidation: "Renewed property stress or USD spike.",
    horizon: "Weeks to months",
    advisoryAction: "enter",
    lastUpdated: "50m ago",
    theme: "china",
    scores: {
      driverStrength: 14,
      timeCompression: 14,
      marketMispricingScore: 14,
      tradeClarityScore: 9,
      triggerClarityScore: 10,
    },
    entryZone: "4.12–4.18",
    stop: "3.98",
    target1: "4.32",
    target2: "4.45",
  }),
  withQualification({
    id: TID.euTech,
    slug: "eu-tech-crackdown-megacap",
    title: "EU TECH CRACKDOWN — MEGA-CAP MULTIPLE COMPRESSION",
    thesisStatement:
      "EU remedies are becoming structural; multiples still assume business-as-usual growth and monetization.",
    asset: "META",
    direction: "short",
    probability: 46,
    status: "active",
    probabilityRationale:
      "The direction is right, but timing can be slow — needs a binding action to compress the window.",

    hiddenDriver: "Structural remedies (behavioral constraints) that change terminal assumptions.",
    likelyPath: "Binding action → compliance cost rises → growth assumptions compress → multiple derates.",
    marketMisread: "The market still prices enforcement as ‘one-off fines’, not structural constraints.",
    tradeExpression: "Wait for binding action; then short rallies with defined stop (dummy).",

    whyNow: "The narrative is real, but it’s only tradeable when the action becomes binding.",
    whatsUnpriced: "Structural constraint risk isn’t in the multiple yet.",
    trigger: "Binding remedies or enforcement action with clear behavioral constraints.",
    trade: "Strategic short rallies 605–625 · Stop 640 · TP 540",
    invalidation: "Legal wins or settlement that removes structural risk.",
    horizon: "Months",
    advisoryAction: "hold",
    lastUpdated: "2h ago",
    theme: "regulation",
    scores: {
      driverStrength: 12,
      timeCompression: 7,
      marketMispricingScore: 10,
      tradeClarityScore: 7,
      triggerClarityScore: 7,
    },
    entryZone: "605–625",
    stop: "640",
    target1: "575",
    target2: "540",
  }),
];

const STATUS_RANK: Record<string, number> = {
  actionable: 0,
  active: 1,
  watching: 2,
  resolved: 3,
  invalidated: 4,
};

export function sortThesesForDashboard(list: Thesis[]): Thesis[] {
  return [...list].sort((a, b) => {
    // qualification first: tradeable → emerging → theme
    const qRank = (q: Thesis["qualification"]) => (q === "tradeable" ? 0 : q === "emerging" ? 1 : 2);
    const qr = qRank(a.qualification) - qRank(b.qualification);
    if (qr !== 0) return qr;
    const dr = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (dr !== 0) return dr;
    return b.probability - a.probability;
  });
}

export function isTradeable(t: Thesis) {
  return t.qualification === "tradeable";
}
export function isEmerging(t: Thesis) {
  return t.qualification === "emerging";
}
export function isTheme(t: Thesis) {
  return t.qualification === "theme";
}

export function getThesisBySlug(slug: string): Thesis | undefined {
  return MOCK_THESES.find((t) => t.slug === slug);
}

/** Rich static detail for flagship thesis; others use `defaultDetail`. */
export const MOCK_DETAIL_EXTRA: Record<string, Omit<ThesisDetailBundle, "thesis">> = {
  "war-peace-gold-short": {
    evidence: [
      {
        id: "ev-1",
        thesisId: TID.gold,
        source: "Reuters",
        timestamp: "Today · 09:12 UTC",
        headline: "Delegations signal ‘constructive’ weekend talks",
        impact: "major_positive",
        probabilityBefore: 54,
        probabilityAfter: 67,
        interpretation: "Peace process momentum reduces tail-risk bid for bullion.",
      },
      {
        id: "ev-2",
        thesisId: TID.gold,
        source: "WSJ",
        timestamp: "Yesterday · 18:40 UTC",
        headline: "Safe-haven flows steady despite equity rally",
        impact: "minor_negative",
        probabilityBefore: 52,
        probabilityAfter: 54,
        interpretation: "Gold sticky — premium still embedded; sets up fade if headlines improve.",
      },
      {
        id: "ev-3",
        thesisId: TID.gold,
        source: "Bloomberg",
        timestamp: "Yesterday · 14:05 UTC",
        headline: "Dollar firms on front-end yields",
        impact: "neutral",
        probabilityBefore: 51,
        probabilityAfter: 52,
        interpretation: "Not thesis-driving alone; watch combined with geopolitical path.",
      },
    ],
    scenarios: [
      {
        id: "sc-b",
        thesisId: TID.gold,
        label: "Base case",
        probability: 45,
        confirmation: "Talks continue without escalation; data calm.",
        marketConsequence: "Gold drifts lower; vol mean-reverts.",
      },
      {
        id: "sc-u",
        thesisId: TID.gold,
        label: "Bull case",
        probability: 25,
        confirmation: "Surprise breakdown in talks + kinetic headline.",
        marketConsequence: "Gold rips; shorts stopped out.",
      },
      {
        id: "sc-d",
        thesisId: TID.gold,
        label: "Bear case",
        probability: 30,
        confirmation: "Signed framework + risk-on rotation.",
        marketConsequence: "Fast premium unwind; targets hit quicker.",
      },
    ],
    advisoryLog: [
      {
        id: "u1",
        thesisId: TID.gold,
        timestamp: "23m ago",
        text: "Probability crossed 55% — entry setup valid.",
      },
      {
        id: "u2",
        thesisId: TID.gold,
        timestamp: "6h ago",
        text: "Escalatory rhetoric interpreted as negotiation posture — thesis unchanged.",
      },
      {
        id: "u3",
        thesisId: TID.gold,
        timestamp: "1d ago",
        text: "Peace-track headline flow improved — raised conviction; tighten risk on invalidation.",
      },
    ],
    relatedAssets: [
      { symbol: "XAUUSD", note: "Primary expression" },
      { symbol: "GLD", note: "ETF proxy" },
      { symbol: "TLT", note: "Risk-off cross-check" },
      { symbol: "DXY", note: "Dollar pressure valve" },
    ],
  },
};

function defaultDetail(slug: string): ThesisDetailBundle {
  const thesis = getThesisBySlug(slug)!;
  return {
    thesis,
    evidence: [
      {
        id: `${slug}-e1`,
        thesisId: thesis.id,
        source: "FT",
        timestamp: "Today · 10:20 UTC",
        headline: "Macro desk note: positioning still light vs narrative",
        impact: "minor_positive",
        probabilityBefore: Math.max(30, thesis.probability - 6),
        probabilityAfter: thesis.probability,
        interpretation: "Narrative catching up; watch next two catalysts.",
      },
      {
        id: `${slug}-e2`,
        thesisId: thesis.id,
        source: "CNBC",
        timestamp: "Yesterday · 16:55 UTC",
        headline: "Cross-asset flows show hesitation at key level",
        impact: "neutral",
        probabilityBefore: Math.max(28, thesis.probability - 8),
        probabilityAfter: Math.max(30, thesis.probability - 6),
        interpretation: "Market coiled — needs confirmation from fundamentals.",
      },
    ],
    scenarios: [
      {
        id: `${slug}-sc1`,
        thesisId: thesis.id,
        label: "Base case",
        probability: 40,
        confirmation: "Trend continues with noisy headlines.",
        marketConsequence: "Base trade plan remains operative.",
      },
      {
        id: `${slug}-sc2`,
        thesisId: thesis.id,
        label: "Bull case",
        probability: 35,
        confirmation: "Catalyst confirms direction early.",
        marketConsequence: "Accelerated path to targets.",
      },
      {
        id: `${slug}-sc3`,
        thesisId: thesis.id,
        label: "Bear case",
        probability: 25,
        confirmation: "Invalidation triggers hit.",
        marketConsequence: "Exit / reduce per advisory.",
      },
    ],
    advisoryLog: [
      {
        id: `${slug}-a1`,
        thesisId: thesis.id,
        timestamp: thesis.lastUpdated,
        text: "Thesis refreshed from latest evidence stack — probabilities updated.",
      },
      {
        id: `${slug}-a2`,
        thesisId: thesis.id,
        timestamp: "1d ago",
        text: "Monitoring next scheduled print / speaker for trigger clarity.",
      },
    ],
    relatedAssets: [
      { symbol: thesis.asset, note: "Primary" },
      { symbol: "SPY", note: "Risk proxy" },
      { symbol: "UUP", note: "USD check" },
    ],
  };
}

export function getThesisDetail(slug: string): ThesisDetailBundle | undefined {
  const t = getThesisBySlug(slug);
  if (!t) return undefined;
  const extra = MOCK_DETAIL_EXTRA[slug];
  if (extra) return { thesis: t, ...extra };
  return defaultDetail(slug);
}

export const MOCK_FEED_SIGNALS: FeedSignal[] = [
  {
    id: "f1",
    source: "Reuters",
    timestamp: "12m ago",
    headline: "Oil rises as traders weigh Gulf transit headlines",
    summary: "Crude bid on perceived tail risk; flows modest vs prior shocks.",
    linkedThesisSlug: "strait-hormuz-oil-long",
    linkedThesisTitle: "Strait of Hormuz risk — Oil long",
  },
  {
    id: "f2",
    source: "Bloomberg",
    timestamp: "18m ago",
    headline: "Gold slips as risk appetite improves",
    summary: "Equities firm; precious metals lose marginal safe-haven premium.",
    linkedThesisSlug: "war-peace-gold-short",
    linkedThesisTitle: "War / Peace — Gold short",
  },
  {
    id: "f3",
    source: "WSJ",
    timestamp: "32m ago",
    headline: "Fed officials caution on cutting too soon",
    summary: "Front-end yields tick higher; duration underperforms.",
    linkedThesisSlug: "fed-pivot-delayed-tlt-weakness",
    linkedThesisTitle: "Fed pivot delayed — TLT weakness",
  },
  {
    id: "f4",
    source: "FT",
    timestamp: "55m ago",
    headline: "EU regulators sharpen remedies on platform competition",
    summary: "Structural constraints narrative strengthens for mega-cap platforms.",
    linkedThesisSlug: "eu-tech-crackdown-megacap",
    linkedThesisTitle: "EU tech crackdown — Mega-cap compression",
  },
  {
    id: "f5",
    source: "Nikkei",
    timestamp: "1h ago",
    headline: "China credit impulse shows early stabilization",
    summary: "Industrial demand proxies tick up; metals watchlist active.",
    linkedThesisSlug: "china-stimulus-copper-long",
    linkedThesisTitle: "China stimulus — Copper long",
  },
  {
    id: "f6",
    source: "Defense News",
    timestamp: "1h ago",
    headline: "Pentagon accelerates award timeline on missile defense line",
    summary: "Backlog visibility improves for defense primes.",
    linkedThesisSlug: "us-defense-repricing-rtx-lmt",
    linkedThesisTitle: "US defense repricing — RTX / LMT long",
  },
  {
    id: "f7",
    source: "Argus",
    timestamp: "2h ago",
    headline: "OPEC+ members disagree on quota enforcement",
    summary: "Unity narrative frays; vol surface bid in energy.",
    linkedThesisSlug: "opec-unity-fracturing",
    linkedThesisTitle: "OPEC unity fracturing — Oil volatility",
  },
  {
    id: "f8",
    source: "The Information",
    timestamp: "3h ago",
    headline: "Cloud capex guides creep higher for hyperscalers",
    summary: "Spend discipline vs AI race tension rises for mega-cap tech.",
    linkedThesisSlug: "ai-capex-squeeze-qqq-rotation",
    linkedThesisTitle: "AI capex squeeze — QQQ rotation",
  },
  {
    id: "f9",
    source: "AP",
    timestamp: "4h ago",
    headline: "Dollar index grinds up on rate differential",
    summary: "FX moves not thesis-specific; feeds cross-asset checklist.",
  },
  {
    id: "f10",
    source: "Economist",
    timestamp: "5h ago",
    headline: "Emerging market flows soften on USD strength",
    summary: "Macro backdrop note — propose thesis if linked book risk emerges.",
  },
  {
    id: "f11",
    source: "BBC",
    timestamp: "6h ago",
    headline: "Climate summit commitments rekindle industrial policy debate",
    summary: "Second-order readthrough to grid metals and defense supply chains.",
  },
  {
    id: "f12",
    source: "Barron's",
    timestamp: "7h ago",
    headline: "Retail traders rotate into single-stock momentum",
    summary: "Positioning noise — DEPTH4 flags when it intersects narrative.",
  },
];

export const MOCK_LIVE_SIGNAL_TICKER: LiveSignalTickerItem[] = [
  {
    id: "lst-1",
    kind: "thesis_update",
    source: "Reuters",
    timestamp: "09:12 UTC",
    headline: "Delegations signal 'constructive' weekend talks",
    thesisName: "WAR/PEACE—GOLD SHORT",
    probabilityBefore: 54,
    probabilityAfter: 67,
    impact: "major_positive",
  },
  {
    id: "lst-2",
    kind: "building_new_thesis",
    source: "Bloomberg",
    timestamp: "08:03 UTC",
    headline: "EU finalizes AI liability framework vote",
    topic: "AI Regulation—Tech Multiples",
  },
  {
    id: "lst-3",
    kind: "catalogued",
    source: "WSJ",
    timestamp: "07:41 UTC",
    headline: "Fed official reiterates data-dependent stance",
    note: "No immediate thesis impact",
  },
  {
    id: "lst-4",
    kind: "thesis_update",
    source: "Defense News",
    timestamp: "10:26 UTC",
    headline: "Pentagon accelerates award timeline on missile defense line",
    thesisName: "US DEFENSE REPRICING—RTX LONG",
    probabilityBefore: 49,
    probabilityAfter: 55,
    impact: "minor_positive",
  },
  {
    id: "lst-5",
    kind: "catalogued",
    source: "FT",
    timestamp: "11:04 UTC",
    headline: "Freight rates firm as insurers reprice shipping lanes",
    note: "Monitoring",
  },
];

export const MOCK_COMMUNITY_THESES: CommunityThesis[] = [
  {
    id: "ct-1",
    title: "SOFT LANDING OVERPRICED — EQUITY MULTIPLE CLIP",
    author: "M. Kline",
    reputationBadge: "Top 5% accuracy",
    probability: 62,
    followers: 1842,
    status: "published",
  },
  {
    id: "ct-2",
    title: "JAPAN YCC EXIT — USDJPY REGIME SHIFT",
    author: "Akira S.",
    reputationBadge: "Top 10% accuracy",
    probability: 57,
    followers: 931,
    status: "active",
  },
  {
    id: "ct-3",
    title: "EM CREDIT CRACK — HIGH YIELD SPREAD WIDENING",
    author: "V. Ionescu",
    reputationBadge: "High conviction",
    probability: 54,
    followers: 612,
    status: "published",
  },
  {
    id: "ct-4",
    title: "US RE-INDUSTRIALIZATION — COPPER + GRID CAPEX",
    author: "S. Dahl",
    reputationBadge: "Top 20% accuracy",
    probability: 49,
    followers: 407,
    status: "published",
  },
];

export const MOCK_LEADERBOARD: LeaderboardUser[] = [
  { id: "lb-1", rank: 1, name: "M. Kline", badge: "Top 5% accuracy", winRate: "68%", resolvedCount: 41, followers: 1842 },
  { id: "lb-2", rank: 2, name: "Akira S.", badge: "Top 10% accuracy", winRate: "64%", resolvedCount: 33, followers: 931 },
  { id: "lb-3", rank: 3, name: "N. Patel", badge: "Top 15% accuracy", winRate: "61%", resolvedCount: 29, followers: 812 },
  { id: "lb-4", rank: 4, name: "V. Ionescu", badge: "High conviction", winRate: "59%", resolvedCount: 22, followers: 612 },
  { id: "lb-5", rank: 5, name: "S. Dahl", badge: "Top 20% accuracy", winRate: "57%", resolvedCount: 18, followers: 407 },
];

export const MOCK_POSITIONS: Position[] = [
  {
    id: "p1",
    symbol: "XAUUSD",
    side: "short",
    linkedThesisId: TID.gold,
    thesisStatus: "active",
    recommendation: "hold",
    probability: 67,
    latestUpdate: "Beijing talks confirmed; thesis strengthened.",
  },
  {
    id: "p2",
    symbol: "USOIL",
    side: "long",
    linkedThesisId: TID.hormuz,
    thesisStatus: "active",
    recommendation: "hold",
    probability: 58,
    latestUpdate: "Transit risk premium building slowly.",
  },
  {
    id: "p3",
    symbol: "TLT",
    side: "short",
    linkedThesisId: TID.tlt,
    thesisStatus: "active",
    recommendation: "reduce",
    probability: 61,
    latestUpdate: "Pivot timeline pushed — duration remains vulnerable.",
  },
  {
    id: "p4",
    symbol: "RTX",
    side: "long",
    linkedThesisId: TID.defense,
    thesisStatus: "actionable",
    recommendation: "enter",
    probability: 55,
    latestUpdate: "Award path clearing; accumulation zone live.",
  },
  {
    id: "p5",
    symbol: "HG",
    side: "long",
    linkedThesisId: TID.copper,
    thesisStatus: "actionable",
    recommendation: "enter",
    probability: 52,
    latestUpdate: "China impulse improving; watch inventories.",
  },
];

export const MOCK_WATCHLIST: WatchlistIdea[] = [
  {
    id: "w1",
    symbol: "QQQ",
    thesisTitle: "AI capex squeeze — QQQ rotation",
    thesisSlug: "ai-capex-squeeze-qqq-rotation",
    note: "No position yet — waiting for earnings confirmation.",
  },
  {
    id: "w2",
    symbol: "META",
    thesisTitle: "EU tech crackdown — Mega-cap compression",
    thesisSlug: "eu-tech-crackdown-megacap",
    note: "Strategic short setup; sizing TBD.",
  },
  {
    id: "w3",
    symbol: "USOIL",
    thesisTitle: "OPEC unity fracturing — Oil volatility",
    thesisSlug: "opec-unity-fracturing",
    note: "Vol expression only; directional stand aside.",
  },
];

export const MOCK_TRACK_RECORD_METRICS: TrackRecordMetrics = {
  winRate: "63%",
  profitFactor: "1.8",
  avgR: "+1.4R",
  avgDuration: "10 days",
  pctEverTradeable: "52%",
};

export const MOCK_RESOLVED_THESES: ResolvedThesisRecord[] = [
  {
    id: "rt-1",
    title: "BANK LIQUIDITY REPRICING — USD STRENGTH",
    asset: "UUP",
    openedDate: "2026-03-02",
    closedDate: "2026-03-11",
    maxProbabilityPath: "41% → 58% → 79%",
    result: "+3.2R",
    duration: "9 days",
  },
  {
    id: "rt-2",
    title: "FRONT-END SHOCK — DURATION RESET",
    asset: "TLT",
    openedDate: "2026-02-08",
    closedDate: "2026-02-21",
    maxProbabilityPath: "38% → 61% → 72%",
    result: "+2.1R",
    duration: "13 days",
  },
  {
    id: "rt-3",
    title: "SOFT LANDING OVERPRICED — EQUITY MULTIPLE CLIP",
    asset: "SPY",
    openedDate: "2026-01-14",
    closedDate: "2026-01-26",
    maxProbabilityPath: "46% → 64% → 70%",
    result: "-1.0R",
    duration: "12 days",
  },
  {
    id: "rt-4",
    title: "SUPPLY DISLOCATION — ENERGY UPSIDE",
    asset: "USOIL",
    openedDate: "2025-12-03",
    closedDate: "2025-12-15",
    maxProbabilityPath: "44% → 67% → 82%",
    result: "+4.2R",
    duration: "12 days",
  },
  {
    id: "rt-5",
    title: "RISK-OFF BID — GOLD BREAKOUT FAIL",
    asset: "XAUUSD",
    openedDate: "2025-11-05",
    closedDate: "2025-11-12",
    maxProbabilityPath: "52% → 66% → 71%",
    result: "+1.3R",
    duration: "7 days",
  },
];

export function thesisTitleById(id: string): string {
  return MOCK_THESES.find((t) => t.id === id)?.title ?? "—";
}

export function thesisSlugById(id: string): string | undefined {
  return MOCK_THESES.find((t) => t.id === id)?.slug;
}

export function thesisStatusById(id: string) {
  return MOCK_THESES.find((t) => t.id === id)?.status ?? "watching";
}
