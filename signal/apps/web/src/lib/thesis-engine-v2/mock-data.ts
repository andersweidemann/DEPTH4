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
import { SYSTEM_THESIS_IDS } from "./system-thesis-ids";

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

/** Stable IDs shared with `public.theses` (Supabase seed). */
export const TID = SYSTEM_THESIS_IDS;

export const MOCK_THESES: Thesis[] = [
  withQualification({
    id: TID.gold,
    slug: "war-peace-gold-short",
    title: "Sell GLD because peace progress will continue",
    thesisStatement:
      "De-escalation odds have moved into the tradeable zone; bullion is still priced for escalation tail-risk.",
    asset: "XAUUSD",
    direction: "short",
    probability: 67,
    status: "ready",
    probabilityRationale:
      "Peace talk momentum improved, but gold still trades like escalation risk is the base case.",

    hiddenDriver: "This is about actual diplomacy, not just market mood shifting.",
    likelyPath: "Headlines shift from escalation to steady progress on talks; gold can fall before a final deal is signed.",
    marketMisread: "The market still prices gold for escalation risk, even though de-escalation odds are rising.",
    tradeExpression: "Short gold via XAUUSD/GLD; keep invalidation above the local high.",

    whyNow: "The odds of peace talks succeeding are now high enough that gold should be falling — but it hasn't yet.",
    whatsUnpriced: "The escalation premium is still embedded in spot and short-dated hedges.",
    trigger: "Second positive headline within 24 hours, and oil/volatility stay calm.",
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

    insiderFlow: {
      bullInstruments: ["BTC", "TLT"],
      bearInstruments: ["XAUUSD", "WTI", "ITA"],
      confirmTags: ["ceasefire", "peace talks", "tanker deal", "de-escalation"],
    },
  }),
  withQualification({
    id: TID.hormuz,
    slug: "strait-hormuz-oil-long",
    title: "Buy USO because Hormuz transit risk will rise",
    thesisStatement:
      "Transit risk is being priced like noise; the distribution has fattened and crude is late to reflect it.",
    asset: "USOIL",
    direction: "long",
    probability: 58,
    status: "active",
    probabilityRationale:
      "Chokepoint risk is rising faster than inventory/flow data is normalizing; the market is too anchored to spot balances.",

    hiddenDriver: "Chokepoint fragility (insurance, routing, and policy signaling).",
    likelyPath: "Friction shows up first in freight/insurance, then physical diffs, then flat price jumps.",
    marketMisread: "The market still expects smooth flows; it's a jump-risk story.",
    tradeExpression: "Be positioned for upside moves in oil, with defined risk, and respect headline gaps.",

    whyNow: "The posture has shifted and routing chatter is real — this is when oil can jump faster than people expect.",
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

    insiderFlow: {
      bullInstruments: ["USOIL", "WTI", "BRENT"],
      bearInstruments: [],
      confirmTags: ["hormuz", "strait", "tanker", "oil", "opec"],
    },
  }),
  withQualification({
    id: TID.opec,
    slug: "opec-unity-fracturing",
    title: "Buy USO because OPEC will hold prices if US shale slows",
    thesisStatement:
      "If US shale slows, OPEC keeps barrels tight and oil stays bid. The market still doubts that combo.",
    asset: "USOIL",
    direction: "long",
    probability: 44,
    status: "ready",
    probabilityRationale:
      "OPEC can hold the line if US rigs roll; the market still bets shale bails everyone out.",

    hiddenDriver: "OPEC needs cash and US shale is the swing supply.",
    likelyPath: "Rig count slips first, then OPEC holds cuts, then flat oil grinds higher.",
    marketMisread: "Equity desks still treat US oil supply as unlimited at any price.",
    tradeExpression: "Own USO on pullbacks; add if weekly rig count and producer guides show shale slowing.",

    whyNow: "OPEC discipline plus slowing shale is the path to higher flat price this quarter.",
    whatsUnpriced: "The market still prices US supply as elastic forever.",
    trigger: "Two weak rig-count prints plus soft capex guides from named producers.",
    trade: "Buy USO on dips toward 72–74 zone · Stop below last swing low · Add on trigger",
    invalidation: "OPEC breaks discipline or US shale roars back with strong rig data.",
    horizon: "Months",
    advisoryAction: "enter",
    lastUpdated: "4h ago",
    theme: "energy",
    scores: {
      driverStrength: 14,
      timeCompression: 9,
      marketMispricingScore: 13,
      tradeClarityScore: 7,
      triggerClarityScore: 8,
    },

    insiderFlow: {
      bullInstruments: ["USOIL"],
      bearInstruments: [],
      confirmTags: ["opec", "quota", "production", "meeting"],
    },
  }),
  withQualification({
    id: TID.tlt,
    slug: "fed-pivot-delayed-tlt-weakness",
    title: "Sell TLT because Fed cuts will land later than priced",
    thesisStatement:
      "The market still prices cuts too soon; duration is vulnerable before the Fed gives permission to rally.",
    asset: "TLT",
    direction: "short",
    probability: 61,
    status: "active",
    probabilityRationale:
      "Data keeps failing to cool cleanly; rate markets still expect cuts sooner than the Fed likely delivers.",

    hiddenDriver: "Sticky services inflation + resilient labor keeps the Fed restrictive longer than futures price.",
    likelyPath: "Cuts get pushed stepwise; long duration sells first, then stabilizes when pricing matches reality.",
    marketMisread: "The market still assumes rate cuts will come sooner than they probably will.",
    tradeExpression: "Sell/avoid long duration; express via TLT weakness with clear stop above key level.",

    whyNow: "The next two data prints can shift rate expectations quickly; bond longs are early.",
    whatsUnpriced: "A later pivot path is still not fully priced in duration.",
    trigger: "Hot CPI/Payrolls or Fed language that explicitly pushes back on easing expectations.",
    trade: "Scale 92.50–93.80 adds · Stop 95.20 · TP 88.00",
    invalidation: "Clear disinflation turn or risk-off shock that forces a TLT bid.",
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

    insiderFlow: {
      bullInstruments: [],
      bearInstruments: ["TLT", "IEF"],
      confirmTags: ["fed", "cpi", "payrolls", "rates", "inflation"],
    },
  }),
  withQualification({
    id: TID.defense,
    slug: "us-defense-repricing-rtx-lmt",
    title: "Buy RTX because Pentagon awards will firm backlog",
    thesisStatement:
      "Backlog visibility is improving; multiples still reflect yesterday's uncertainty.",
    asset: "RTX",
    direction: "long",
    probability: 55,
    status: "ready",
    probabilityRationale:
      "Contract cadence and appropriations language are turning into numbers; the market is still trading vibes.",

    hiddenDriver: "Appropriations + award cadence, not the daily headline cycle.",
    likelyPath: "Awards convert to backlog → guide confidence improves → multiples re-rate on visibility.",
    marketMisread: "The market focuses on headlines and misses how strong the order backlog is.",
    tradeExpression: "Own primes where backlog converts cleanly; use defined risk around key support.",

    whyNow: "The awards are close enough to pull forward the re-rating window.",
    whatsUnpriced: "Visibility into outyear cash flows isn't reflected in current multiples.",
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

    insiderFlow: {
      bullInstruments: ["RTX", "LMT"],
      bearInstruments: [],
      confirmTags: ["defense", "appropriations", "pentagon", "contract", "backlog"],
    },
  }),
  withQualification({
    id: TID.qqq,
    slug: "ai-capex-squeeze-qqq-rotation",
    title: "Avoid QQQ adds because AI capex will squeeze margins first",
    thesisStatement:
      "The market is still pricing AI spend as free; the bill hits margins before revenue catches up.",
    asset: "QQQ",
    direction: "watch",
    probability: 49,
    status: "watching",
    probabilityRationale:
      "The story is real but the timing isn't tight yet — it needs an earnings catalyst to become tradeable.",

    hiddenDriver: "Capex intensity vs monetization lag.",
    likelyPath: "Guides rise → margins wobble → winners and losers split → money shifts toward cash-flow leaders.",
    marketMisread: "Index pricing still assumes smooth AI monetization with minimal margin cost.",
    tradeExpression: "Wait for the print; then add cash-flow leaders and cut capex-heavy laggards.",

    whyNow: "The trade opportunity is forming into earnings — but it isn't a 'now' trade without confirmation.",
    whatsUnpriced: "Dispersion risk is underpriced at the index level.",
    trigger: "Two consecutive prints show margin pressure or demand softness tied to AI spend.",
    trade: "Wait for trigger; then cut beta / favor quality.",
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

    insiderFlow: {
      bullInstruments: ["QQQ"],
      bearInstruments: [],
      confirmTags: ["ai", "capex", "margin", "guidance", "nvidia"],
    },
  }),
  withQualification({
    id: TID.copper,
    slug: "china-stimulus-copper-long",
    title: "Buy HG because China stimulus will speed up again",
    thesisStatement:
      "The market is still priced for 'slow China'; policy impulse is turning and copper is late to it.",
    asset: "HG",
    direction: "long",
    probability: 52,
    status: "ready",
    probabilityRationale:
      "Policy tone + early HF data suggest impulse stabilization; copper pricing still trails the old slow-China story.",

    hiddenDriver: "Policy impulse (credit + fiscal) turning from defense to support.",
    likelyPath: "Impulse turns → industrial proxies firm → inventories draw → copper catches up to the growth shift.",
    marketMisread: "The market still thinks China will stay slow, even if policy support speeds things up.",
    tradeExpression: "Own copper in a defined zone; add on confirmation via inventory draw and HF demand prints.",

    whyNow: "Policy signals are turning while the market is still stuck in last quarter's story.",
    whatsUnpriced: "A reacceleration path isn't reflected in copper risk premium.",
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

    insiderFlow: {
      bullInstruments: ["HG", "COPPER"],
      bearInstruments: [],
      confirmTags: ["china", "stimulus", "copper", "infrastructure"],
    },
  }),
  withQualification({
    id: TID.euTech,
    slug: "eu-tech-crackdown-megacap",
    title: "Sell META because EU platform rules will get tougher",
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
    marketMisread: "The market treats this like a one-time fine, not a rule change that lasts.",
    tradeExpression: "Wait for binding action; then short rallies with defined stop.",

    whyNow: "The story is real, but it's only tradeable when the action becomes binding.",
    whatsUnpriced: "Structural constraint risk isn't in the multiple yet.",
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

    insiderFlow: {
      bullInstruments: [],
      bearInstruments: ["META"],
      confirmTags: ["european commission", "dma", "antitrust", "meta", "fine"],
    },
  }),
];

const STATUS_RANK: Record<string, number> = {
  ready: 0,
  active: 1,
  watching: 2,
  forming: 3,
  resolved: 4,
  invalidated: 5,
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
        headline: "Delegations signal 'constructive' weekend talks",
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
        confirmation: "Signed framework + broad risk-on bid.",
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
        headline: "Macro desk note: positioning still light vs story",
        impact: "minor_positive",
        probabilityBefore: Math.max(30, thesis.probability - 6),
        probabilityAfter: thesis.probability,
        interpretation: "Market catching up; watch the next two catalysts.",
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
    linkedThesisTitle: "Buy USO because Hormuz transit risk will rise",
  },
  {
    id: "f2",
    source: "Bloomberg",
    timestamp: "18m ago",
    headline: "Gold slips as risk appetite improves",
    summary: "Equities firm; precious metals lose marginal safe-haven premium.",
    linkedThesisSlug: "war-peace-gold-short",
    linkedThesisTitle: "Sell GLD because peace progress will continue",
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
    summary: "Regulation story strengthens for mega-cap platforms.",
    linkedThesisSlug: "eu-tech-crackdown-megacap",
    linkedThesisTitle: "Sell META because EU platform rules will get tougher",
  },
  {
    id: "f5",
    source: "Nikkei",
    timestamp: "1h ago",
    headline: "China credit impulse shows early stabilization",
    summary: "Industrial demand proxies tick up; metals watchlist active.",
    linkedThesisSlug: "china-stimulus-copper-long",
    linkedThesisTitle: "Buy HG because China stimulus will speed up again",
  },
  {
    id: "f6",
    source: "Defense News",
    timestamp: "1h ago",
    headline: "Pentagon accelerates award timeline on missile defense line",
    summary: "Backlog visibility improves for defense primes.",
    linkedThesisSlug: "us-defense-repricing-rtx-lmt",
    linkedThesisTitle: "Buy RTX because Pentagon awards will firm backlog",
  },
  {
    id: "f7",
    source: "Argus",
    timestamp: "2h ago",
    headline: "OPEC+ members disagree on quota enforcement",
    summary: "Unity story frays; volatility bids in energy.",
    linkedThesisSlug: "opec-unity-fracturing",
    linkedThesisTitle: "Buy USO because OPEC will hold prices if US shale slows",
  },
  {
    id: "f8",
    source: "The Information",
    timestamp: "3h ago",
    headline: "Cloud capex guides creep higher for hyperscalers",
    summary: "Spend discipline vs AI race tension rises for mega-cap tech.",
    linkedThesisSlug: "ai-capex-squeeze-qqq-rotation",
    linkedThesisTitle: "Avoid QQQ adds because AI capex will squeeze margins first",
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
    headline: "Retail traders move money into single-stock momentum",
    summary: "Positioning noise — DEPTH4 flags it when it matches a thesis.",
  },
];

export const MOCK_LIVE_SIGNAL_TICKER: LiveSignalTickerItem[] = [
  {
    id: "lst-1",
    kind: "thesis_update",
    source: "Reuters",
    timestamp: "09:12 UTC",
    headline: "Delegations signal 'constructive' weekend talks",
    thesisName: "Sell GLD because peace progress will continue",
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
    topic: "AI regulation — Tech multiples",
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
    id: "lst-3b",
    kind: "building_new_thesis",
    source: "CNBC",
    timestamp: "07:18 UTC",
    headline: "Treasury auction tails; term premium talk returns",
    topic: "Rates stress — TLT downside",
  },
  {
    id: "lst-4",
    kind: "thesis_update",
    source: "Defense News",
    timestamp: "10:26 UTC",
    headline: "Pentagon accelerates award timeline on missile defense line",
    thesisName: "Buy RTX because Pentagon awards will firm backlog",
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
  {
    id: "lst-6",
    kind: "thesis_update",
    source: "Argus",
    timestamp: "12:09 UTC",
    headline: "OPEC+ delegates push back on quota enforcement rumors",
    thesisName: "Buy USO because OPEC will hold prices if US shale slows",
    probabilityBefore: 52,
    probabilityAfter: 46,
    impact: "minor_negative",
  },
  {
    id: "lst-7",
    kind: "catalogued",
    source: "Nikkei",
    timestamp: "06:52 UTC",
    headline: "Japan wage talks show mixed outcomes across sectors",
    note: "No immediate thesis impact",
  },
  {
    id: "lst-8",
    kind: "thesis_update",
    source: "Reuters",
    timestamp: "13:22 UTC",
    headline: "Shipping insurers widen war-risk clauses after new advisories",
    thesisName: "Buy USO because Hormuz transit risk will rise",
    probabilityBefore: 58,
    probabilityAfter: 66,
    impact: "major_positive",
  },
];

export const MOCK_COMMUNITY_THESES: CommunityThesis[] = [
  {
    id: "ct-1",
    thesisSlug: "china-stimulus-copper-long",
    title: "Buy HG because China stimulus will speed up again",
    author: "@macro_maven",
    reputationBadge: "Top 10% accuracy",
    probability: 58,
    scoreTotal: 71,
    followers: 2300,
    lastUpdated: "Updated 4h ago",
    status: "published",
  },
  {
    id: "ct-2",
    thesisSlug: "opec-unity-fracturing",
    title: "Buy USO because OPEC will hold prices if US shale slows",
    author: "@vol_hunter",
    reputationBadge: "12-month win rate: 73%",
    probability: 54,
    scoreTotal: 79,
    followers: 1800,
    lastUpdated: "Updated 1h ago",
    status: "active",
  },
  {
    id: "ct-3",
    thesisSlug: "tlt-duration-short",
    title: "Sell TLT because cuts are priced too soon",
    author: "@rates_trader",
    reputationBadge: "Top 5% accuracy",
    probability: 61,
    scoreTotal: 76,
    followers: 1500,
    lastUpdated: "Updated 2h ago",
    status: "published",
  },
  {
    id: "ct-4",
    thesisSlug: "eu-tech-crackdown-megacap",
    title: "Sell META because EU platform rules will get tougher",
    author: "@credit_bull",
    reputationBadge: "Top 20% accuracy",
    probability: 52,
    scoreTotal: 71,
    followers: 731,
    lastUpdated: "Updated 6h ago",
    status: "published",
  },
];

export const MOCK_LEADERBOARD: LeaderboardUser[] = [
  {
    id: "lb-1",
    rank: 1,
    name: "@macro_maven",
    badge: "Top 5% accuracy",
    winRate: "73%",
    resolvedCount: 18,
    avgScore: "82/100",
    followers: 2300,
  },
  {
    id: "lb-2",
    rank: 2,
    name: "@vol_hunter",
    badge: "Top 10% accuracy",
    winRate: "68%",
    resolvedCount: 24,
    avgScore: "79/100",
    followers: 1800,
  },
  {
    id: "lb-3",
    rank: 3,
    name: "@rates_trader",
    badge: "Top 15% accuracy",
    winRate: "65%",
    resolvedCount: 31,
    avgScore: "76/100",
    followers: 1500,
  },
  {
    id: "lb-4",
    rank: 4,
    name: "@em_watcher",
    badge: "Top 20% accuracy",
    winRate: "62%",
    resolvedCount: 15,
    avgScore: "74/100",
    followers: 942,
  },
  {
    id: "lb-5",
    rank: 5,
    name: "@credit_bull",
    badge: "Top 25% accuracy",
    winRate: "59%",
    resolvedCount: 22,
    avgScore: "71/100",
    followers: 731,
  },
];

export const MOCK_POSITIONS: Position[] = [
  {
    id: "p1",
    symbol: "XAUUSD",
    side: "short",
    linkedThesisId: TID.gold,
    thesisStatus: "active",
    tradeStatus: "open",
    openedAt: "2026-05-06T08:40:00Z",
    entryPrice: 3290,
    size: 0.5,
    stopLoss: 3312,
    takeProfit: 3180,
    notes: "Opened off entry zone.",
    currentPnl: "—",
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
    tradeStatus: "draft",
    openedAt: "2026-05-06T09:10:00Z",
    entryPrice: 72.9,
    size: 1,
    stopLoss: 70.8,
    takeProfit: 78.5,
    notes: "Drafted while waiting for incident confirmation.",
    currentPnl: "—",
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
    tradeStatus: "open",
    openedAt: "2026-05-05T15:00:00Z",
    entryPrice: 93.2,
    size: 20,
    stopLoss: 95.2,
    takeProfit: 88,
    notes: "Short-duration tactical line.",
    currentPnl: "—",
    recommendation: "reduce",
    probability: 61,
    latestUpdate: "Pivot timeline pushed — duration remains vulnerable.",
  },
  {
    id: "p4",
    symbol: "RTX",
    side: "long",
    linkedThesisId: TID.defense,
    thesisStatus: "ready",
    tradeStatus: "closed",
    openedAt: "2026-04-22T14:05:00Z",
    closedAt: "2026-05-02T15:30:00Z",
    entryPrice: 129.4,
    size: 12,
    stopLoss: 123,
    takeProfit: 148,
    notes: "Exit on target 1.",
    realizedPnl: "+1.2R",
    recommendation: "enter",
    probability: 55,
    latestUpdate: "Award path clearing; accumulation zone live.",
  },
  {
    id: "p5",
    symbol: "HG",
    side: "long",
    linkedThesisId: TID.copper,
    thesisStatus: "ready",
    tradeStatus: "cancelled",
    openedAt: "2026-05-04T11:12:00Z",
    entryPrice: 4.15,
    size: 1,
    stopLoss: 3.98,
    takeProfit: 4.45,
    notes: "Cancelled after price ran without a clean entry.",
    realizedPnl: "—",
    recommendation: "enter",
    probability: 52,
    latestUpdate: "China impulse improving; watch inventories.",
  },
];

export const MOCK_WATCHLIST: WatchlistIdea[] = [
  {
    id: "w1",
    symbol: "QQQ",
    thesisTitle: "Avoid QQQ adds because AI capex will squeeze margins first",
    thesisSlug: "ai-capex-squeeze-qqq-rotation",
    note: "No position yet — waiting for earnings confirmation.",
  },
  {
    id: "w2",
    symbol: "META",
    thesisTitle: "Sell META because EU platform rules will get tougher",
    thesisSlug: "eu-tech-crackdown-megacap",
    note: "Strategic short; sizing TBD.",
  },
  {
    id: "w3",
    symbol: "USOIL",
    thesisTitle: "Buy USO because OPEC will hold prices if US shale slows",
    thesisSlug: "opec-unity-fracturing",
    note: "Add on rig-count weakness; cut if OPEC leaks quota breaks.",
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
    title: "Buy UUP because bank funding stress will lift the dollar",
    asset: "UUP",
    openedDate: "2026-03-02",
    closedDate: "2026-03-11",
    maxProbabilityPath: "41% → 58% → 79%",
    result: "+3.2R",
    duration: "9 days",
  },
  {
    id: "rt-2",
    title: "Sell TLT because front-end rate shock will last",
    asset: "TLT",
    openedDate: "2026-02-08",
    closedDate: "2026-02-21",
    maxProbabilityPath: "38% → 61% → 72%",
    result: "+2.1R",
    duration: "13 days",
  },
  {
    id: "rt-3",
    title: "Sell SPY because soft-landing odds were too high",
    asset: "SPY",
    openedDate: "2026-01-14",
    closedDate: "2026-01-26",
    maxProbabilityPath: "46% → 64% → 70%",
    result: "-1.0R",
    duration: "12 days",
  },
  {
    id: "rt-4",
    title: "Buy USO because supply tightness will drive crude higher",
    asset: "USOIL",
    openedDate: "2025-12-03",
    closedDate: "2025-12-15",
    maxProbabilityPath: "44% → 67% → 82%",
    result: "+4.2R",
    duration: "12 days",
  },
  {
    id: "rt-5",
    title: "Sell GLD because gold breakout follow-through will fail",
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
