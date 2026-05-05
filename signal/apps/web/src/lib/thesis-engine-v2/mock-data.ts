import type {
  FeedSignal,
  Position,
  Thesis,
  ThesisDetailBundle,
  WatchlistIdea,
} from "./types";

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
  {
    id: TID.gold,
    slug: "war-peace-gold-short",
    title: "WAR / PEACE — GOLD SHORT",
    thesisStatement:
      "If de-escalation odds rise materially, gold’s geopolitical premium should compress faster than spot prices imply.",
    asset: "XAUUSD",
    direction: "short",
    probability: 67,
    status: "actionable",
    whyNow: "Beijing talks pushed peace odds above 50%.",
    whatsUnpriced: "Gold still reflects escalation premium.",
    trigger: "Sustained diplomatic progress + lower tail-risk pricing in vol and oil.",
    trade: "Short 3285–3295 · Stop 3312 · TP 3180",
    invalidation: "Fresh hot conflict headline or break above 3312 on volume.",
    horizon: "Days to weeks",
    advisoryAction: "enter",
    lastUpdated: "23m ago",
    entryZone: "3285–3295",
    stop: "3312",
    target1: "3220",
    target2: "3180",
  },
  {
    id: TID.hormuz,
    slug: "strait-hormuz-oil-long",
    title: "STRAIT OF HORMUZ RISK — OIL LONG",
    thesisStatement:
      "Transit risk is under-reflected in front-month crude if military posture in the Gulf stays elevated.",
    asset: "USOIL",
    direction: "long",
    probability: 58,
    status: "active",
    whyNow: "Tanker routing chatter and naval asset movements picked up.",
    whatsUnpriced: "Insurance and freight stress not fully in flat price.",
    trigger: "Incident or official restriction language on key chokepoints.",
    trade: "Long pullbacks toward 72.40–73.20 · Stop 70.80 · TP 78.50 / 81.00",
    invalidation: "Confirmed stand-down and normalized flows without new incidents.",
    horizon: "Weeks",
    advisoryAction: "hold",
    lastUpdated: "1h ago",
    entryZone: "72.40–73.20",
    stop: "70.80",
    target1: "78.50",
    target2: "81.00",
  },
  {
    id: TID.opec,
    slug: "opec-unity-fracturing",
    title: "OPEC UNITY FRACTURING — OIL VOLATILITY",
    thesisStatement:
      "Compliance fatigue plus political incentives raise the odds of surprise supply policy — good for vol, messy for directional crude.",
    asset: "USOIL",
    direction: "watch",
    probability: 44,
    status: "watching",
    whyNow: "Member rhetoric diverging ahead of the next guidance window.",
    whatsUnpriced: "Options still priced for ‘steady policy’.",
    trigger: "Leak or meeting outcome that breaks the unity narrative.",
    trade: "Stand aside directional; favor defined-risk vol structures (dummy).",
    invalidation: "Clean communique with no dissent and steady quotas.",
    horizon: "Months",
    advisoryAction: "watch",
    lastUpdated: "4h ago",
  },
  {
    id: TID.tlt,
    slug: "fed-pivot-delayed-tlt-weakness",
    title: "FED PIVOT DELAYED — TLT WEAKNESS",
    thesisStatement:
      "Sticky inflation + resilient activity push the first cut later — duration should cheapen before the Fed validates dovishness.",
    asset: "TLT",
    direction: "short",
    probability: 61,
    status: "active",
    whyNow: "Recent prints reinforced ‘higher for longer’ repricing.",
    whatsUnpriced: "Bonds still embed an early pivot in parts of the curve.",
    trigger: "Fed speakers harden guidance or data surprises hawkish.",
    trade: "Scale 92.50–93.80 adds · Stop 95.20 · TP 88.00",
    invalidation: "Clear disinflation path or risk-off flight to duration.",
    horizon: "Weeks to months",
    advisoryAction: "hold",
    lastUpdated: "45m ago",
    entryZone: "92.50–93.80",
    stop: "95.20",
    target1: "90.00",
    target2: "88.00",
  },
  {
    id: TID.defense,
    slug: "us-defense-repricing-rtx-lmt",
    title: "US DEFENSE REPRICING — RTX / LMT LONG",
    thesisStatement:
      "Budget trajectory + order visibility supports a re-rating in primes as the market moves from headline fear to backlog math.",
    asset: "RTX",
    direction: "long",
    probability: 55,
    status: "actionable",
    whyNow: "Award timing and appropriations language improved visibility.",
    whatsUnpriced: "Multiples still discount multi-year outyear cash flows.",
    trigger: "Contract awards and guide affirmation on supply chain.",
    trade: "RTX 128–132 accumulation · Stop 123 · TP 148",
    invalidation: "Major program slip or funding shock.",
    horizon: "Months",
    advisoryAction: "enter",
    lastUpdated: "12m ago",
    entryZone: "128–132",
    stop: "123",
    target1: "140",
    target2: "148",
  },
  {
    id: TID.qqq,
    slug: "ai-capex-squeeze-qqq-rotation",
    title: "AI CAPEX SQUEEZE — QQQ ROTATION",
    thesisStatement:
      "Hyperscaler capex intensity pressures near-term FCF narratives; leadership narrows to names with clearest monetization.",
    asset: "QQQ",
    direction: "watch",
    probability: 49,
    status: "watching",
    whyNow: "Capex guides trending up while macro liquidity is neutral-tight.",
    whatsUnpriced: "Index-level concentration hides dispersion risk.",
    trigger: "Earnings that show margin pressure from AI spend or cloud price competition.",
    trade: "Reduce beta into strength; rotate to quality cash generators (dummy).",
    invalidation: "AI revenue acceleration beats across the Mag7 complex.",
    horizon: "Quarters",
    advisoryAction: "watch",
    lastUpdated: "3h ago",
  },
  {
    id: TID.copper,
    slug: "china-stimulus-copper-long",
    title: "CHINA STIMULUS REACCELERATION — COPPER LONG",
    thesisStatement:
      "If China leans harder into infrastructure and power grid spend, copper tightness meets policy — a classic late-cycle goods impulse.",
    asset: "HG",
    direction: "long",
    probability: 52,
    status: "actionable",
    whyNow: "Credit and fiscal signals turning less defensive.",
    whatsUnpriced: "Dr. Copper still trading ‘slow China’.",
    trigger: "High-frequency steel/credit inflection + inventory draw.",
    trade: "Long HG 4.12–4.18 zone · Stop 3.98 · TP 4.45",
    invalidation: "Renewed property stress or USD spike.",
    horizon: "Weeks to months",
    advisoryAction: "enter",
    lastUpdated: "50m ago",
    entryZone: "4.12–4.18",
    stop: "3.98",
    target1: "4.32",
    target2: "4.45",
  },
  {
    id: TID.euTech,
    slug: "eu-tech-crackdown-megacap",
    title: "EU TECH CRACKDOWN — MEGA-CAP MULTIPLE COMPRESSION",
    thesisStatement:
      "Regulatory stack in EU raises compliance cost and caps terminal growth assumptions for global platforms.",
    asset: "META",
    direction: "short",
    probability: 46,
    status: "active",
    whyNow: "Enforcement language hardened; remedies look structural.",
    whatsUnpriced: "US-listed names still EU-earnings optimistic.",
    trigger: "Binding remedies or fines with behavioral constraints.",
    trade: "Strategic short rallies 605–625 · Stop 640 · TP 540",
    invalidation: "Legal wins or settlement that removes structural risk.",
    horizon: "Months",
    advisoryAction: "hold",
    lastUpdated: "2h ago",
    entryZone: "605–625",
    stop: "640",
    target1: "575",
    target2: "540",
  },
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
    const dr = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (dr !== 0) return dr;
    return b.probability - a.probability;
  });
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

export function thesisTitleById(id: string): string {
  return MOCK_THESES.find((t) => t.id === id)?.title ?? "—";
}

export function thesisSlugById(id: string): string | undefined {
  return MOCK_THESES.find((t) => t.id === id)?.slug;
}

export function thesisStatusById(id: string) {
  return MOCK_THESES.find((t) => t.id === id)?.status ?? "watching";
}
