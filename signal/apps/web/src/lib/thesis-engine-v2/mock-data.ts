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
import { formatThesisMicroLabel, getThesisDisplayTitle } from "./thesis-display-title";

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
    title: "Sell GLD because peace progress will continue within weeks",
    microLabel: "War risk keeps gold bid",
    whyThesisExists:
      "Peace paths rarely reprice gold on one headline; they work through how much tail-risk premium portfolios will carry when the tape is calm.\n\nThis thesis exists because spot can stay rich while diplomacy grinds — the edge is eventual decompression when calmer weeks stack without fresh shocks.\n\nTrigger, Trade, and the four-level cascade own timing and execution; this block is only the framing.\n\nDEPTH4 uses it as a positioning lens: fade embedded fear premium once the incident calendar thins, not as a bet that politics vanishes.",
    oneLineSummary:
      "Sell gold into the peace drift: talks are moving but spot still prices a big war scare.",
    thesisStatement:
      "Sell GLD because peace progress will continue within the next several weeks due to steady talks and fewer escalation headlines, probability 67%.",
    asset: "XAUUSD",
    direction: "short",
    probability: 67,
    status: "ready",
    probabilityRationale:
      "Odds of calm rose but GLD still embeds a wide war tail — that mismatch tends to close on calendar, not on a single headline.",

    thesisCascade: {
      l1Confirmed:
        "Talks are live and both sides keep showing up. Escalation headlines have thinned versus last month.",
      l2ThisQuarter:
        "If oil and equities stay orderly, safe-haven bids fade headline-by-headline over the next few weeks — watch funding and ETF flows, not spot alone.",
      l3ThisYear:
        "As the path holds, hedges roll off gradually and duration of emergency bids shortens; the tape reprices how much insurance it needs to carry.",
      l4Backdrop2026:
        "Lower tail risk versus the last two years shifts baseline demand away from perpetual hedges — that backdrop shows up across geopolitics and rates books.",
    },

    hiddenDriver: "Real diplomacy is moving faster than the price of gold admits.",
    likelyPath: "Calm headlines stack → funds cut hedge size → GLD drifts down before any final treaty text.",
    marketMisread: "",
    tradeExpression: "Short GLD / XAUUSD with a hard stop if hot headlines return.",

    whyNow: "Peace odds crossed the line where gold should fade — but the metal has not repriced yet.",
    whatsUnpriced:
      "Flows still lean on a fat tail-war scenario even as engagement holds and escalation thins. The variant read is that premium can leak week by week long before a signing ceremony — desks update slowly, so the gap can persist until the calendar proves it wrong.",
    trigger:
      "Two calm geopolitical weeks in a row: no new kinetic strikes, plus at least two credible progress headlines, while oil and VIX stay contained.",
    trade:
      "Lean short GLD / XAU only inside the entry window in Trade plan; scale out in steps toward targets there. If invalidation prints, stand down immediately — do not average into the tail.",
    invalidation: "New kinetic strike or GLD closes above 3312 through the weekly close — stand down the short.",
    timeStop:
      "If GLD keeps making highs on peaceful headlines for a full quarter, downgrade the thesis — the de-escalation trade is not working on schedule.",
    horizon: "Days to weeks (first repricing window)",
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
    title: "Buy USO because Hormuz chokepoint risk will spike within weeks",
    microLabel: "Gulf routes keep oil on edge",
    whyThesisExists:
      "Chokepoint risk is not a slow inventory story — it is insurance, routing, and navy language moving ahead of flat headline crude.\n\nThis thesis exists because physical freight can gap before retail flow notices; the tape often sleeps until a verified friction print.\n\nExecution lives in Trigger, Trade, and Trade plan; here we only name why the mismatch can exist at all.\n\nDEPTH4 tracks it as jump-risk: small probability, large barrel swing — size and stops matter more than narrative cleverness.",
    oneLineSummary:
      "Buy oil before the headline: the strait is fragile but flat crude still sleeps on a one-off shock.",
    thesisStatement:
      "Buy USO because Hormuz transit risk will spike within weeks due to insurance, routing, and navy warnings, probability 58%.",
    asset: "USOIL",
    direction: "long",
    probability: 58,
    status: "active",
    probabilityRationale:
      "Routing and policy language are heating faster than inventories alone explain — flat crude is late to the physical stack.",

    thesisCascade: {
      l1Confirmed:
        "Insurers and ship brokers are already widening war-risk clauses. That is a live cost, not a forecast.",
      l2ThisQuarter:
        "Verified friction reroutes cargoes first; benchmark freight can gap inside a week while headline traders are still debating intent.",
      l3ThisYear:
        "A sustained security scare reprices spare-capacity assumptions globally; liquid ETFs capture the first repricing leg.",
      l4Backdrop2026:
        "Underspend on spare oil capacity keeps chokepoint sensitivity high — that structural bid shows up across macro energy books.",
    },

    hiddenDriver: "One incident at the chokepoint hits millions of barrels per day — price cannot stay sleepy if it happens.",
    likelyPath: "Freight and insurance move first, then physical spreads, then USO reprices in gaps.",
    marketMisread: "",
    tradeExpression: "Own USO on dips with a hard stop under the last swing — size for headline gaps.",

    whyNow: "Routing warnings are stacking while crude still trades range-bound — that mismatch breaks fast.",
    whatsUnpriced:
      "Inventory prints dominate screens, yet insurance clauses and routing advisories already embed a higher chokepoint probability than flat crude implies. The misread is treating strait headlines as background noise while physical desks pay up first.",
    trigger:
      "Verified strait incident or new military restriction language, OR a two-handle jump in benchmark freight in under five sessions.",
    trade:
      "Own USO on weakness using the entry band and stop in Trade plan; size for gaps, not for smooth mean reversion. Add only after freight or policy confirms the jump window.",
    invalidation: "Official stand-down plus one week of normal flows and calm insurance quotes — exit the long.",
    timeStop:
      "If no incident and no freight spike within eight weeks, downgrade — chokepoint fear did not convert to price.",
    horizon: "Weeks (jump-risk window)",
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
    title: "Buy USO because OPEC will hold prices if US shale slows this quarter",
    microLabel: "Oil supply unity cracking",
    whyThesisExists:
      "OPEC needs cash flow; the fastest swing supply is still US shale — when rigs roll, barrels do not magically appear elsewhere.\n\nThis thesis exists because unity can look tight on headlines while rig and capex data say US supply is slowing — the market can be late wiring both.\n\nTrigger and Trade own when to add size; this section is only why the slow-shale + disciplined cartel story can coexist.\n\nDEPTH4 tracks it as a grind trade: confirmation is boring data, not a single minister quote.",
    oneLineSummary:
      "Buy oil if US rigs roll: OPEC needs the money and will keep barrels tight while shale stumbles.",
    thesisStatement:
      "Buy USO because OPEC will hold prices higher if US shale slows this quarter due to fewer rigs and softer producer guides, probability 44%.",
    asset: "USOIL",
    direction: "long",
    probability: 44,
    status: "ready",
    probabilityRationale:
      "Rig cadence is softening while OPEC language stays disciplined — futures still lean on shale riding to the rescue.",

    thesisCascade: {
      l1Confirmed:
        "OPEC is verbally holding the line and US rig counts are no longer rising every week. Both are facts today.",
      l2ThisQuarter:
        "Soft rig prints plus trimmed producer capex guides tighten the US swing barrel without needing a headline war.",
      l3ThisYear:
        "If US adds fewer marginal barrels while OPEC holds, flat price can grind higher on modest demand — expression stays liquid via USO.",
      l4Backdrop2026:
        "Scarce spare capacity keeps pricing power with producers — that macro bias shows up across DEPTH4 energy work.",
    },

    hiddenDriver: "OPEC needs cash; American shale is the only big source that can swing fast.",
    likelyPath: "Rigs slip → OPEC holds cuts → oil grinds up on any demand bounce.",
    marketMisread: "",
    tradeExpression: "Add USO on weak rig weeks; cut if OPEC leaks real quota cheating.",

    whyNow: "Data is starting to show shale fatigue while OPEC keeps the story tight.",
    whatsUnpriced:
      "Headlines chase OPEC rhetoric, yet rig counts and shale capex guides already imply a tighter US swing than equity flow models assume. The variant read is both can be true: disciplined OPEC plus slower shale equals a higher floor without a crisis.",
    trigger:
      "Two consecutive weekly rig-count misses AND at least two named US producers guide shale capex lower on calls.",
    trade:
      "Buy USO on planned pullbacks using Trade plan levels; add size only after the trigger above fires. If rigs re-accelerate or quota discipline breaks, stand down — see Invalidation.",
    invalidation: "OPEC publicly breaks quota OR US rigs rip higher for four straight weeks — stand down.",
    timeStop:
      "If the trigger never fires within two quarters, downgrade — the slow-shale story did not prove out.",
    horizon: "This quarter into next (slow-shale window)",
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
    title: "Sell TLT because Fed cuts will land later than futures price this year",
    microLabel: "Rates stay higher for longer",
    whyThesisExists:
      "Bonds price a path of cuts; the Fed still sounds like it wants proof inflation is dead, not wishful thinking.\n\nThis thesis exists because services and payrolls can keep the first cut drifting right while TLT trades like the dovish pivot is imminent.\n\nData windows and execution sit in Trigger / Trade / Trade plan — here we only explain the policy-vs-curve wedge.\n\nDEPTH4 treats it as a cycle mismatch: when prints disagree with the curve, duration reprices first.",
    oneLineSummary:
      "Sell long bonds: futures still bet on early cuts while the Fed sounds higher-for-longer.",
    thesisStatement:
      "Sell TLT because the first Fed cut will land later than futures price within the next few months due to sticky inflation and firm jobs data, probability 61%.",
    asset: "TLT",
    direction: "short",
    probability: 61,
    status: "active",
    probabilityRationale:
      "Payrolls and CPI still print firm enough that the dots and futures disagree — duration is carrying the dovish scenario.",

    thesisCascade: {
      l1Confirmed:
        "Fed speakers keep pushing back on cuts and core inflation is not falling in a straight line. Futures still show cuts starting sooner than the dots.",
      l2ThisQuarter:
        "The next CPI-plus-payroll window can shift the priced first-cut date; long duration is the first place that reprices.",
      l3ThisYear:
        "If cuts drift into next year, price discovery lower in bonds continues until the curve matches a slower easing path.",
      l4Backdrop2026:
        "Funding stays tighter than equity hopes until inflation truly breaks — that bias threads through macro books.",
    },

    hiddenDriver: "Services prices and jobs are too firm for the Fed to validate the cut path the curve already built.",
    likelyPath: "Hot print → yields jump → TLT sells off → only stabilizes when pricing matches the Fed.",
    marketMisread: "",
    tradeExpression: "Sell TLT rips; cover only if data turns cold for real.",

    whyNow: "The next two prints can move the first-cut date fast — bond longs are early.",
    whatsUnpriced:
      "The curve still leans on the Fed cutting to support risk assets, while guidance sounds focused on inflation persistence. The variant read is that CPI, payrolls, and tone can stay mutually firm longer than TLT’s price implies.",
    trigger:
      "Hot CPI or hot payrolls OR three Fed speakers in one week push back hard on near-term cuts — any one fires the trade.",
    trade:
      "Sell or add to TLT shorts into strength using the entry band and stop in Trade plan; cover only if data turns convincingly cold across multiple prints. Do not fight a simultaneous softening in both inflation and labor in one cycle.",
    invalidation: "Core CPI cools two prints in a row AND payrolls soften — stand down the short.",
    timeStop:
      "If TLT cannot make new lows after three CPI cycles, downgrade — the late-cut thesis is not paying.",
    horizon: "Weeks to months (data cycle)",
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
    title: "Buy RTX because Pentagon awards will firm backlog this quarter",
    microLabel: "Wars drive steady defense spend",
    whyThesisExists:
      "Defense is a flow story: budgets turn into line-item awards long before cable news explains the EPS impact.\n\nThis thesis exists because primes can re-rate on backlog visibility while generalists still price political noise as the whole story.\n\nAwards, calls, and levels live elsewhere on the page — here is only why visibility can lead price.\n\nDEPTH4 tracks it as industrial cash conversion: when appropriations move, models are usually late, not early.",
    oneLineSummary:
      "Buy defense primes: contracts are lining up but the stock still prices last year’s doubt.",
    thesisStatement:
      "Buy RTX because named Pentagon awards will firm backlog within this quarter due to appropriations moving and primes taking share, probability 55%.",
    asset: "RTX",
    direction: "long",
    probability: 55,
    status: "ready",
    probabilityRationale:
      "Award cadence is turning into booked dollars while RTX still trades as if major programs might vaporize.",

    thesisCascade: {
      l1Confirmed:
        "Defense budgets are set higher and Pentagon language points to accelerated awards. RTX order book is already rising in filings.",
      l2ThisQuarter:
        "Named awards can hit the tape in weeks; tape reprices before sell-side models fully refresh backlog math.",
      l3ThisYear:
        "Backlog converts to cash-flow visibility; execution-heavy primes separate from laggards on conversion quality.",
      l4Backdrop2026:
        "NATO and industrial policy keep defense spend sticky — that backdrop supports geopolitical book bias.",
    },

    hiddenDriver: "Cash is moving from appropriations into contracts faster than sell-side models assume.",
    likelyPath: "Award headlines stack → backlog line rises → guidance firms → stock closes the valuation gap.",
    marketMisread: "",
    tradeExpression: "Buy RTX into award flow; stop if a flagship program slips.",

    whyNow: "Award dates are close enough that the next press release can gap the stock.",
    whatsUnpriced:
      "Screens overweight politics chatter while award calendars and supply checks already say backlog is building. The variant read is that EPS models are high relative to booked work that is already in motion.",
    trigger:
      "At least two named missile-defense awards to RTX/LMT AND management affirms supply chain stability on the call.",
    trade:
      "Accumulate RTX into award flow using Trade plan entry and stop; scale toward targets there after backlog lines confirm. Exit quickly if a flagship program slips — see Invalidation.",
    invalidation: "Major program cancel or funding pulled from the line — exit longs.",
    timeStop:
      "If backlog lines do not rise after two earnings cycles, downgrade — the award wave thesis stalled.",
    horizon: "Months (award window)",
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
    title: "Don't buy more QQQ yet because AI spending will hit margins this earnings season",
    microLabel: "AI costs before AI profits",
    whyThesisExists:
      "Mega-caps still sell AI as a smooth growth curve, but the next few quarters are really about who pays for the build-out before the revenue line proves out.\n\nEarnings are the honest clock: one soft margin guide is noise; several names telling the same spend story in the same window is a pattern the basket averages away.\n\nThis thesis exists to track dispersion risk while QQQ still trades like a single bet — so you are not surprised when the tape splits cash-flow leaders from high-capex laggards.\n\nDEPTH4 uses it as a watch lens: sizing and hedges stay in Trade and Trade plan; you only act when Trigger says the cluster is live.",
    oneLineSummary:
      "Don't add to QQQ yet: many companies will feel the cost of AI spending in earnings before the profits show up, and the index hides that risk.",
    thesisStatement:
      "Don't buy more QQQ yet because AI-related spending (chips, data centers, staff) will hit profit margins before new revenue shows up this earnings season, probability 49%.",
    asset: "QQQ",
    direction: "watch",
    probability: 49,
    status: "watching",
    probabilityRationale:
      "Probability moved with the margin narrative, not with a single ticker — the next two earnings windows decide if the cluster is real.",

    thesisCascade: {
      l1Confirmed:
        "AI-related spending is already ramping: chips, data centers, and headcount. Big tech guides show the bill is here, not someday.",
      l2ThisQuarter:
        "This quarter you get margin pain in earnings before new revenue proves out. One soft guide is noise; several in the same two weeks are a pattern.",
      l3ThisYear:
        "Index diversification blurs single-name margin signals until earnings cluster; dispersion shows up before the basket reprices cleanly.",
      l4Backdrop2026:
        "Expensive capital keeps punishing weak cash conversion first — that bias threads through equity books this year.",
    },

    hiddenDriver: "Companies are spending fast on AI before the extra profit shows up in the numbers.",
    likelyPath: "Spend stays high → margins slip → the market splits leaders from laggards → money moves to real cash flow.",
    marketMisread: "",
    tradeExpression:
      "Own fewer risky growth names and more strong cash-flow names. Don't add QQQ until the margin cluster clears.",

    whyNow: "Earnings season is the clock. The tape prices smooth AI wins; the prints can say otherwise.",
    whatsUnpriced:
      "The edge sits outside obvious mega-cap headlines: when several smaller QQQ names raise AI or infra spend and cut margin or EPS guide in the same window, that cluster is the signal — not one stock alone. Single-ticker flow still misses coordinated guide cuts until the basket has already averaged the damage.",
    trigger: `WHEN THIS BECOMES A TRADE, NOT JUST A STORY

Watch two earnings windows in a row where:
- Several non-NVDA/MSFT QQQ names say AI or infrastructure spending is going up
AND
- At least some of them cut profit-margin or EPS guidance because of that spending

If that happens twice in back-to-back earnings weeks, the thesis is "live".`,
    trade: `WHEN THE TRIGGER HITS

- Stop adding to broad QQQ.
- Shift part of your QQQ exposure into strong cash-flow AI leaders (for example, MSFT, GOOGL) or a quality factor ETF.
- If you are aggressive, hedge with a small QQQ short or puts, or by shorting weaker high-capex growth names.`,
    invalidation: `STAND DOWN IF

- AI revenue starts to beat across many QQQ names, not just the obvious leaders
AND
- Profit margins stay stable or improve while AI spending remains high

If broader AI earnings look good and margins hold up, the market is handling AI spend better than this thesis assumes. In that case, stop treating this as a live edge.`,
    timeStop:
      "If the trigger has not fired within two earnings seasons, treat the thesis as stale and downgrade the probability — the risk never matured on schedule.",
    horizon: "Up to two earnings seasons (until live or stale)",
    advisoryAction: "watch",
    lastUpdated: "3h ago",
    theme: "equities",
    entryZone: "No new QQQ buys · trim zone 465–475",
    stop: "Weekly close above 480 with broad margin beats across Mag 7",
    target1: "440",
    target2: "420",
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
    title: "Buy HG because China stimulus will speed up again within months",
    microLabel: "China's build-out lifts copper",
    whyThesisExists:
      "Copper is the fast industrial vote on whether Beijing’s easing is real — warehouses react before macro podcasts catch up.\n\nThis thesis exists because HG can lag policy tone: traders anchor to old property fear while credit and restocking quietly inflect.\n\nInventory and trigger logic live in Trigger / Trade plan; here is only why the pulse can lead price.\n\nDEPTH4 uses it as a China impulse lens: small probability of a sharp catch-up move if data stacks.",
    oneLineSummary:
      "Buy copper: Beijing is turning the dial while HG still prices slow China.",
    thesisStatement:
      "Buy HG because China credit and spending stimulus will speed up again within months due to easier policy and restocking, probability 52%.",
    asset: "HG",
    direction: "long",
    probability: 52,
    status: "ready",
    probabilityRationale:
      "Credit pulse is stabilizing while HG still prices last year’s pessimism — the gap should close when restock proves out.",

    thesisCascade: {
      l1Confirmed:
        "Beijing is verbally back-stopping growth and early credit reads are no longer collapsing. That is a policy turn, not a rumor.",
      l2ThisQuarter:
        "Restocking and infrastructure bids hit industrial metals first; HG often leads a broader China rerating window.",
      l3ThisYear:
        "If impulse sticks, inventories draw globally and copper can grind for several quarters on tight scrap and grid spend.",
      l4Backdrop2026:
        "Grid and commodity spend stay onshoring-friendly — hard-assets bias returns when China impulse is live.",
    },

    hiddenDriver: "Credit and fiscal lines are inflecting; copper is the fast read on whether it is real.",
    likelyPath: "Pulse firms → warehouses empty → HG rallies before the macro podcasts notice.",
    marketMisread: "",
    tradeExpression: "Own HG in a box; add only after inventory confirms the turn.",

    whyNow: "Policy tone flipped while HG is still priced for no help.",
    whatsUnpriced:
      "PMI headlines dominate, yet credit impulse and bonded inventory already imply a firmer restock path than spot implies. The variant read is funds still anchor to property fear while the stimulus lever is turning — copper is late, not early, to that stack.",
    trigger:
      "Two consecutive inventory draws in Shanghai bonded stocks AND a confirming credit impulse print in the same month.",
    trade:
      "Own HG using the entry band, stop, and targets in Trade plan; add only after inventory and credit confirm together. If property panic or a USD funding spike returns, stand down — see Invalidation.",
    invalidation: "Property crash headlines return with force OR USD spikes on a funding scare — exit HG long.",
    timeStop:
      "If no draws and no credit tick within two quarters, downgrade — China impulse thesis did not land.",
    horizon: "Weeks to months (restock window)",
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
    title: "Sell META because EU platform rules will bite within months",
    microLabel: "Ad machine funding AI dreams",
    whyThesisExists:
      "EU risk for META moved from headline fines to binding product limits — that hits revenue mechanics, not just legal reserves.\n\nThis thesis exists because US flow still treats Brussels as a paid one-off while remedy text is already changing how ads can run.\n\nRemedy timing and trade expression sit in Trigger and Trade; here is only why regulation can bite margins slowly then suddenly.\n\nDEPTH4 tracks it as a cash-flow drag: compliance spend rises before growth reaccelerates.",
    oneLineSummary:
      "Sell META into EU enforcement: fines were priced; behavior rules were not.",
    thesisStatement:
      "Sell META because EU platform rules will tighten within months due to binding remedies and daily fines that change how ads run, probability 46%.",
    asset: "META",
    direction: "short",
    probability: 46,
    status: "active",
    probabilityRationale:
      "Enforcement is shifting from fines to enforceable product change — multiples still look like the old fine cycle.",

    thesisCascade: {
      l1Confirmed:
        "EU courts already ordered real product changes, not just cash penalties. Compliance teams are staffing up now.",
      l2ThisQuarter:
        "The next binding step hits revenue mechanics (ads, app stores) faster than many US models assume.",
      l3ThisYear:
        "Margin dollars shrink as product reroutes; the stock derates in steps as guides catch compliance drag.",
      l4Backdrop2026:
        "Global platform regulation stays a headwind for ad-heavy megacaps — tech books keep that bias explicit.",
    },

    hiddenDriver: "Behavior rules hit revenue lines; fines were only the opening act.",
    likelyPath: "Binding order → compliance spend rises → guides cut → stock derates in steps.",
    marketMisread: "",
    tradeExpression: "Short META into EU headlines with a hard stop above prior highs.",

    whyNow: "Enforcement is entering the binding phase — that is when shorts pay.",
    whatsUnpriced:
      "US flow still prices EU risk as a settled check while remedy language already forces product changes that hit attach rates and ad load. The variant read is EPS models are high relative to ongoing compliance and revenue mechanics shifts — not relative to the last fine headline alone.",
    trigger:
      "Published binding remedy that forces product change OR two weeks of EU daily fines with no legal stay.",
    trade:
      "Short META into rips using Trade plan entry, stop, and cover zones; add only after binding remedy or sustained fines confirm the revenue path is shifting. Legal stays that remove teeth mean cover — see Invalidation.",
    invalidation: "Court stay or settlement that removes product limits — cover the short.",
    timeStop:
      "If META walks EU rules without guide cuts within two quarters, downgrade — regulation thesis overstayed.",
    horizon: "Months (remedy window)",
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
    linkedThesisTitle: "Buy USO because Hormuz chokepoint risk will spike within weeks",
  },
  {
    id: "f2",
    source: "Bloomberg",
    timestamp: "18m ago",
    headline: "Gold slips as risk appetite improves",
    summary: "Equities firm; precious metals lose marginal safe-haven premium.",
    linkedThesisSlug: "war-peace-gold-short",
    linkedThesisTitle: "Sell GLD because peace progress will continue within weeks",
  },
  {
    id: "f3",
    source: "WSJ",
    timestamp: "32m ago",
    headline: "Fed officials caution on cutting too soon",
    summary: "Front-end yields tick higher; duration underperforms.",
    linkedThesisSlug: "fed-pivot-delayed-tlt-weakness",
    linkedThesisTitle: "Sell TLT because Fed cuts will land later than futures price this year",
  },
  {
    id: "f4",
    source: "FT",
    timestamp: "55m ago",
    headline: "EU regulators sharpen remedies on platform competition",
    summary: "Regulation story strengthens for mega-cap platforms.",
    linkedThesisSlug: "eu-tech-crackdown-megacap",
    linkedThesisTitle: "Sell META because EU platform rules will bite within months",
  },
  {
    id: "f5",
    source: "Nikkei",
    timestamp: "1h ago",
    headline: "China credit impulse shows early stabilization",
    summary: "Industrial demand proxies tick up; metals watchlist active.",
    linkedThesisSlug: "china-stimulus-copper-long",
    linkedThesisTitle: "Buy HG because China stimulus will speed up again within months",
  },
  {
    id: "f6",
    source: "Defense News",
    timestamp: "1h ago",
    headline: "Pentagon accelerates award timeline on missile defense line",
    summary: "Backlog visibility improves for defense primes.",
    linkedThesisSlug: "us-defense-repricing-rtx-lmt",
    linkedThesisTitle: "Buy RTX because Pentagon awards will firm backlog this quarter",
  },
  {
    id: "f7",
    source: "Argus",
    timestamp: "2h ago",
    headline: "OPEC+ members disagree on quota enforcement",
    summary: "Unity story frays; volatility bids in energy.",
    linkedThesisSlug: "opec-unity-fracturing",
    linkedThesisTitle: "Buy USO because OPEC will hold prices if US shale slows this quarter",
  },
  {
    id: "f8",
    source: "The Information",
    timestamp: "3h ago",
    headline: "Cloud capex guides creep higher for hyperscalers",
    summary: "Spend discipline vs AI race tension rises for mega-cap tech.",
    linkedThesisSlug: "ai-capex-squeeze-qqq-rotation",
    linkedThesisTitle: "Don't buy more QQQ yet because AI spending will hit margins this earnings season",
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
    thesisName: "Sell GLD because peace progress will continue within weeks",
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
    thesisName: "Buy RTX because Pentagon awards will firm backlog this quarter",
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
    thesisName: "Buy USO because OPEC will hold prices if US shale slows this quarter",
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
    thesisName: "Buy USO because Hormuz chokepoint risk will spike within weeks",
    probabilityBefore: 58,
    probabilityAfter: 66,
    impact: "major_positive",
  },
];

export const MOCK_COMMUNITY_THESES: CommunityThesis[] = [
  {
    id: "ct-1",
    thesisSlug: "china-stimulus-copper-long",
    microLabel: "China's build-out lifts copper",
    title: "Buy HG because China stimulus will speed up again within months",
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
    microLabel: "Oil supply unity cracking",
    title: "Buy USO because OPEC will hold prices if US shale slows this quarter",
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
    thesisSlug: "fed-pivot-delayed-tlt-weakness",
    microLabel: "Rates stay higher for longer",
    title: "Sell TLT because Fed cuts will land later than futures price this year",
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
    microLabel: "Ad machine funding AI dreams",
    title: "Sell META because EU platform rules will bite within months",
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
    thesisTitle: "Don't buy more QQQ yet because AI spending will hit margins this earnings season",
    thesisSlug: "ai-capex-squeeze-qqq-rotation",
    note: "No position yet — waiting for earnings confirmation.",
  },
  {
    id: "w2",
    symbol: "META",
    thesisTitle: "Sell META because EU platform rules will bite within months",
    thesisSlug: "eu-tech-crackdown-megacap",
    note: "Strategic short; sizing TBD.",
  },
  {
    id: "w3",
    symbol: "USOIL",
    thesisTitle: "Buy USO because OPEC will hold prices if US shale slows this quarter",
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
  const t = MOCK_THESES.find((x) => x.id === id);
  return t ? getThesisDisplayTitle(t) : "—";
}

export function thesisSlugById(id: string): string | undefined {
  return MOCK_THESES.find((t) => t.id === id)?.slug;
}

/** Micro-label for catalog mock theses; null when absent. */
export function thesisMicroLabelById(id: string): string | null {
  const t = MOCK_THESES.find((x) => x.id === id);
  return t ? formatThesisMicroLabel(t.microLabel) : null;
}

export function thesisStatusById(id: string) {
  return MOCK_THESES.find((t) => t.id === id)?.status ?? "watching";
}
