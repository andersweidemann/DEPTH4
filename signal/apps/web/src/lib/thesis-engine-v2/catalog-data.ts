/**
 * Baseline catalog theses shipped with the web app — default thesis narratives aligned with `public.theses`.
 *
 * - IDs and slugs match the seeded catalog rows in Supabase.
 * - At runtime, titles / micro-labels / bodies / slugs from the DB overlay these defaults where present.
 * - This is not a live market feed. Detail bundles omit fabricated evidence or ticker lines; real evidence
 *   comes from `thesis_evidence_log` and related pipelines.
 * - **Forward:** structured `thesisDepthBook` / `body.thesis_depth_book` replaces hand prose `thesisCascade` for
 *   per-depth mispricing + trade selection — see `thesis-depth-canonical.ts`.
 */
import type { Thesis, ThesisDetailBundle, ThesisScenario, ThesisScenarioPathKey } from "./types";
import { SYSTEM_THESIS_IDS } from "./system-thesis-ids";
import { formatThesisMicroLabel, getThesisDisplayTitle } from "./thesis-display-title";
import { normalizeThesisNarrativeFields } from "./thesis-db-body";

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

export const CATALOG_THESES: Thesis[] = [
  withQualification({
    id: TID.gold,
    slug: "war-peace-gold-short",
    title: "Gold will fall as a peace deal removes the war-risk premium the market has been paying within weeks",
    microLabel: "War risk keeps gold bid",
    whyThesisExists:
      "Peace paths rarely reprice gold on one headline; they work through how much tail-risk premium portfolios will carry when the tape is calm.\n\nThis thesis exists because spot can stay rich while diplomacy grinds — the edge is eventual decompression when calmer weeks stack without fresh shocks.\n\nTrigger, Trade, and the four-level cascade own timing and execution; this block is only the framing.\n\nDEPTH4 uses it as a positioning lens: fade embedded fear premium once the incident calendar thins, not as a bet that politics vanishes.",
    oneLineSummary:
      "Peace drift meets a rich safe-haven bid: talks are moving but spot still prices a fat tail.",
    thesisStatement:
      "Gold should fade over the next several weeks if steady talks and fewer escalation headlines unwind part of the war-risk premium still embedded in spot.",
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
        "If oil and equities stay orderly, gold’s safe-haven bid can leak week by week — watch GLD and ETF flows, not spot alone, over the next few weeks.",
      l3ThisYear:
        "As calm weeks stack, funds slowly shrink war hedges on GLD long before any final treaty — the tape adjusts how much fear premium it pays to hold.",
      l4Backdrop2026:
        "Tail risk is lower than the last two years, so portfolios need less permanent insurance in gold — that background makes the peace fade easier across geopolitics and rates theses this year.",
    },

    hiddenDriver: "Real diplomacy is moving faster than the price of gold admits.",
    likelyPath: "Calm headlines stack → funds cut hedge size → GLD drifts down before any final treaty text.",
    marketMisread: "",
    tradeExpression: "GLD/XAU downside skew while calm headlines stack; hard stop if kinetic risk returns.",

    whyNow: "Peace odds crossed the line where gold should fade — but the metal has not repriced yet.",
    whatsUnpriced:
      "Flows still lean on a fat tail-war scenario even as engagement holds and escalation thins. The edge is that premium can leak week by week long before a signing ceremony — desks update slowly, so the gap can persist until the calendar proves it wrong.",
    trigger:
      "Two calm geopolitical weeks in a row: no new kinetic strikes, plus at least two credible progress headlines, while oil and VIX stay contained.",
    trade:
      "Work GLD/XAU fade only inside the entry window in Trade plan; scale out in steps toward targets there. If invalidation prints, stand down immediately — do not average into the tail.",
    invalidation:
      "New kinetic strike or GLD closes through the weekly invalidation band you keep in Trade plan — stand down the short.",
    timeStop:
      "If GLD keeps making highs on peaceful headlines through 4–6 weeks without the calm-stack trigger materializing, downgrade the thesis — the de-escalation trade is not working on schedule.",
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

    insiderFlow: {
      bullInstruments: ["BTC", "TLT"],
      bearInstruments: ["XAUUSD", "WTI", "ITA"],
      confirmTags: ["ceasefire", "peace talks", "tanker deal", "de-escalation"],
      contradictTags: [
        "military exercises",
        "naval",
        "blockade",
        "incursion",
        "south china sea",
        "scarborough",
        "spratly",
        "paracel",
        "taiwan strait",
        "second front",
        "kinetic",
        "coast guard",
      ],
    },
  }),
  withQualification({
    id: TID.hormuz,
    slug: "strait-hormuz-oil-long",
    title: "USO will rerate higher as Hormuz chokepoint risk spikes within weeks",
    microLabel: "Gulf routes keep oil on edge",
    whyThesisExists:
      "Chokepoint risk is not a slow inventory story — it is insurance, routing, and navy language moving ahead of flat headline crude.\n\nThis thesis exists because physical freight can gap before retail flow notices; the tape often sleeps until a verified friction print.\n\nExecution lives in Trigger, Trade, and Trade plan; here we only name why the mismatch can exist at all.\n\nDEPTH4 tracks it as jump-risk: small probability, large barrel swing — size and stops matter more than narrative cleverness.",
    oneLineSummary:
      "The strait is fragile but flat crude still underprices a routing-and-insurance shock.",
    thesisStatement:
      "USO should rerate higher within weeks if Hormuz transit risk spikes on insurance, routing, and navy warnings ahead of flat headline crude.",
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
        "A sustained security scare tightens how much spare shipping and oil capacity markets assume exists; USO catches the first sharp repricing leg.",
      l4Backdrop2026:
        "The world still runs thin on spare oil capacity — chokepoint sensitivity stays high all year, and that shows up in every energy thesis on the book.",
    },

    hiddenDriver: "One incident at the chokepoint hits millions of barrels per day — price cannot stay sleepy if it happens.",
    likelyPath: "Freight and insurance move first, then physical spreads, then USO reprices in gaps.",
    marketMisread: "",
    tradeExpression: "USO upside skew on chokepoint headlines; size for gaps, stop under the last swing.",

    whyNow: "Routing warnings are stacking while crude still trades range-bound — that mismatch breaks fast.",
    whatsUnpriced:
      "Inventory prints dominate screens, yet insurance clauses and routing advisories already embed a higher chokepoint probability than flat crude implies. The misread is treating strait headlines as background noise while physical desks pay up first.",
    trigger:
      "Verified strait incident or new military restriction language, OR a two-handle jump in benchmark freight in under five sessions.",
    trade:
      "Scale USO on weakness using the entry band and stop in Trade plan; size for gaps, not for smooth mean reversion. Increase size only after freight or policy confirms the jump window.",
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

    insiderFlow: {
      bullInstruments: ["USOIL", "WTI", "BRENT"],
      bearInstruments: [],
      confirmTags: ["hormuz", "strait", "tanker", "oil", "opec"],
    },
  }),
  withQualification({
    id: TID.opec,
    slug: "opec-unity-fracturing",
    title: "USO will find a floor as OPEC holds barrels tight while US shale slows this quarter",
    microLabel: "Oil supply unity cracking",
    whyThesisExists:
      "OPEC needs cash flow; the fastest swing supply is still US shale — when rigs roll, barrels do not magically appear elsewhere.\n\nThis thesis exists because unity can look tight on headlines while rig and capex data say US supply is slowing — the market can be late wiring both.\n\nTrigger and Trade own when to add size; this section is only why the slow-shale + disciplined cartel story can coexist.\n\nDEPTH4 tracks it as a grind trade: confirmation is boring data, not a single minister quote.",
    oneLineSummary:
      "US rigs are rolling while OPEC language stays disciplined — the tape is slow to price both together.",
    thesisStatement:
      "USO should grind higher this quarter if OPEC holds prices firm while US shale slows on fewer rigs and softer producer guides.",
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
        "If US adds fewer marginal barrels while OPEC holds, oil can grind higher on modest demand — USO stays the simple, liquid way to play the floor.",
      l4Backdrop2026:
        "Spare capacity is thin — producers keep pricing power, and that bias runs through every oil thesis we track this year.",
    },

    hiddenDriver: "OPEC needs cash; American shale is the only big source that can swing fast.",
    likelyPath: "Rigs slip → OPEC holds cuts → oil grinds up on any demand bounce.",
    marketMisread: "",
    tradeExpression: "USO upside bias after weak rig prints; stand down if OPEC quota discipline cracks.",

    whyNow: "Data is starting to show shale fatigue while OPEC keeps the story tight.",
    whatsUnpriced:
      "Headlines chase OPEC rhetoric, yet rig counts and shale capex guides already imply a tighter US swing than equity flow models assume. The edge is both can be true: disciplined OPEC plus slower shale equals a higher floor without a crisis.",
    trigger:
      "Two consecutive weekly rig-count misses AND at least two named US producers guide shale capex lower on calls.",
    trade:
      "Scale USO on planned pullbacks using Trade plan levels; increase size only after the trigger above fires. If rigs re-accelerate or quota discipline breaks, stand down — see Invalidation.",
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
    title: "TLT will stay under pressure as the Fed delays rate cuts longer than the market expects this year",
    microLabel: "Rates stay higher for longer",
    whyThesisExists:
      "Bonds price a path of cuts; the Fed still sounds like it wants proof inflation is dead, not wishful thinking.\n\nThis thesis exists because services and payrolls can keep the first cut drifting right while TLT trades like the dovish pivot is imminent.\n\nData windows and execution sit in Trigger / Trade / Trade plan — here we only explain the policy-vs-curve wedge.\n\nDEPTH4 treats it as a cycle mismatch: when prints disagree with the curve, long Treasury prices move first.",
    oneLineSummary:
      "Futures still bet on early cuts while the Fed sounds higher-for-longer.",
    thesisStatement:
      "TLT should stay under pressure over the next few months if the first Fed cut lands later than futures price as sticky inflation and firm jobs data drag on cuts.",
    asset: "TLT",
    direction: "short",
    probability: 61,
    status: "active",
    probabilityRationale:
      "Payrolls and CPI still print firm enough that the dots and futures disagree — TLT is still carrying the dovish scenario too early.",

    thesisCascade: {
      l1Confirmed:
        "Fed speakers keep pushing back on cuts and core inflation is not falling in a straight line. Futures still show cuts starting sooner than the dots.",
      l2ThisQuarter:
        "The next CPI-plus-payroll window can shift when the market prices the first cut; long Treasury prices are the first place that reprices.",
      l3ThisYear:
        "If the first cut drifts toward next year, long bonds keep searching for a lower level until the curve matches a slower easing path.",
      l4Backdrop2026:
        "Borrowing costs stay stiff until inflation really breaks — that background shows up across rates and risk theses on the book this year.",
    },

    hiddenDriver: "Services prices and jobs are too firm for the Fed to validate the cut path the curve already built.",
    likelyPath: "Hot print → yields jump → TLT sells off → only stabilizes when pricing matches the Fed.",
    marketMisread: "",
    tradeExpression: "TLT downside bias into data-driven rips; cover only if prints turn cold across the board.",

    whyNow: "The next two prints can move the first-cut date fast — bond longs are early.",
    whatsUnpriced:
      "The curve still leans on the Fed cutting to support risk assets, while guidance sounds focused on inflation persistence. The edge is that CPI, payrolls, and tone can stay mutually firm longer than TLT’s price implies.",
    trigger:
      "Hot CPI or hot payrolls OR three Fed speakers in one week push back hard on near-term cuts — any one fires the trade.",
    trade:
      "Fade TLT into strength using the entry band and stop in Trade plan; cover only if data turns convincingly cold across multiple prints. Do not fight a simultaneous softening in both inflation and labor in one cycle.",
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

    insiderFlow: {
      bullInstruments: [],
      bearInstruments: ["TLT", "IEF"],
      confirmTags: ["fed", "cpi", "payrolls", "rates", "inflation"],
    },
  }),
  withQualification({
    id: TID.defense,
    slug: "us-defense-repricing-rtx-lmt",
    title: "RTX will rerate higher as named Pentagon contracts lock in its order book this quarter",
    microLabel: "Wars drive steady defense spend",
    whyThesisExists:
      "Defense is a dollars-in-motion story: budgets turn into line-item awards long before cable news explains the profit impact.\n\nThis thesis exists because primes can re-rate when backlog shows up in filings while TV still argues politics as the whole story.\n\nAwards, calls, and levels live elsewhere on the page — here is only why visibility can lead price.\n\nDEPTH4 tracks it plainly: when Congress moves money, Wall Street is usually late, not early, to mark the work already booked.",
    oneLineSummary:
      "Contracts are lining up but the stock still prices last year’s doubt.",
    thesisStatement:
      "RTX should rerate higher this quarter if named Pentagon awards firm backlog as appropriations move and primes take share.",
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
        "Named awards can hit the tape in weeks; the stock can move before published forecasts fully catch the new backlog.",
      l3ThisYear:
        "As booked work turns into revenue and margins in forecasts, primes that execute pull away from laggards that cannot ship.",
      l4Backdrop2026:
        "NATO scale and industrial policy keep defense dollars sticky — that tailwind sits behind defense names across the book all year.",
    },

    hiddenDriver: "Cash is moving from appropriations into contracts faster than published forecasts assume.",
    likelyPath: "Award headlines stack → backlog line rises → guidance firms → stock closes the valuation gap.",
    marketMisread: "",
    tradeExpression: "RTX upside skew into award flow; stop if a flagship program slips.",

    whyNow: "Award dates are close enough that the next press release can gap the stock.",
    whatsUnpriced:
      "Screens overweight politics chatter while award calendars and supply checks already say backlog is building. The edge is that profit forecasts look high relative to booked work that is already in motion.",
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

    insiderFlow: {
      bullInstruments: ["RTX", "LMT"],
      bearInstruments: [],
      confirmTags: ["defense", "appropriations", "pentagon", "contract", "backlog"],
    },
  }),
  withQualification({
    id: TID.qqq,
    slug: "ai-capex-squeeze-qqq-rotation",
    title: "QQQ will underperform as AI spending squeezes margins before revenue catches up this earnings season",
    microLabel: "AI costs before AI profits",
    whyThesisExists:
      "Mega-caps still sell AI as a smooth growth curve, but the next few quarters are really about who pays for the build-out before the revenue line proves out.\n\nEarnings are the honest clock: one soft margin guide is noise; several names telling the same spend story in the same window is a pattern the index smooths over.\n\nThis thesis exists to track how differently QQQ names behave on AI spend while QQQ still trades like one bet — so you are not surprised when the tape splits cash-flow leaders from high-capex laggards.\n\nDEPTH4 uses it as a watch lens: sizing and hedges stay in Trade and Trade plan; you only act when Trigger says the cluster is live.",
    oneLineSummary:
      "Many companies will feel the cost of AI spending in earnings before the profits show up, and the index hides that risk.",
    thesisStatement:
      "QQQ should underperform this earnings season as AI-related spending (chips, data centers, staff) squeezes profit margins before new revenue shows up.",
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
        "In this earnings window, a cluster of margin cuts tied to AI spend is the tell. One soft guide is noise; several in the same two weeks is the pattern.",
      l3ThisYear:
        "Owning the whole index hides which stocks are cracking first. A few clear AI winners will carry the story while a long tail of \"AI noise\" names see margins weaken, so broad QQQ is riskier than it looks.",
      l4Backdrop2026:
        "Money is still expensive. Companies that throw off steady cash can fund AI and earn real returns. Weaker or more indebted names have to spend just to keep up and get punished faster when profits slip.",
    },

    hiddenDriver: "Companies are spending fast on AI before the extra profit shows up in the numbers.",
    likelyPath: "Spend stays high → margins slip → the market splits leaders from laggards → money moves to real cash flow.",
    marketMisread: "",
    tradeExpression:
      "Growth/cash-flow dispersion rises before the index admits it — watch the margin cluster before leaning on broad QQQ.",

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
    title: "Copper will stay bid as China's infrastructure buildout keeps demand above available supply",
    microLabel: "China's build-out lifts copper",
    whyThesisExists:
      "Copper is the fast industrial vote on whether Beijing’s easing is real — warehouses react before macro podcasts catch up.\n\nThis thesis exists because HG can lag policy tone: traders anchor to old property fear while credit and restocking quietly inflect.\n\nInventory and trigger logic live in Trigger / Trade plan; here is only why the pulse can lead price.\n\nDEPTH4 uses it as a China impulse lens: small probability of a sharp catch-up move if data stacks.",
    oneLineSummary:
      "Beijing is turning the dial while HG still prices slow China.",
    thesisStatement:
      "Copper should stay bid over the next few months if China credit and spending stimulus speeds up again on easier policy and restocking.",
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
        "Restocking and infrastructure bids hit industrial metals first; HG often leads before a broader China rerating shows up in headlines.",
      l3ThisYear:
        "If the pulse sticks, warehouses draw globally and copper can grind for several quarters on tight scrap and grid build.",
      l4Backdrop2026:
        "Grid build and factory reshoring keep real metals demand on the table — when China’s impulse is live, hard assets get a clearer bid all year.",
    },

    hiddenDriver: "Credit and fiscal lines are inflecting; copper is the fast read on whether it is real.",
    likelyPath: "Pulse firms → warehouses empty → HG rallies before the macro podcasts notice.",
    marketMisread: "",
    tradeExpression: "HG upside skew while restock proves; stand down until inventory and credit align.",

    whyNow: "Policy tone flipped while HG is still priced for no help.",
    whatsUnpriced:
      "PMI headlines dominate, yet credit impulse and bonded inventory already imply a firmer restock path than spot implies. The edge is funds still anchor to property fear while the stimulus lever is turning — copper is late, not early, to that stack.",
    trigger:
      "Two consecutive inventory draws in Shanghai bonded stocks AND a confirming credit impulse print in the same month.",
    trade:
      "Scale HG using the entry band, stop, and targets in Trade plan; increase size only after inventory and credit confirm together. If property panic or a USD funding spike returns, stand down — see Invalidation.",
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

    insiderFlow: {
      bullInstruments: ["HG", "COPPER"],
      bearInstruments: [],
      confirmTags: ["china", "stimulus", "copper", "infrastructure"],
    },
  }),
  withQualification({
    id: TID.euTech,
    slug: "eu-tech-crackdown-megacap",
    title: "META will underperform as EU platform rules tighten within months",
    microLabel: "Ad machine funding AI dreams",
    whyThesisExists:
      "EU risk for META moved from headline fines to binding product limits — that hits revenue mechanics, not just legal reserves.\n\nThis thesis exists because US flow still treats Brussels as a paid one-off while remedy text is already changing how ads can run.\n\nRemedy timing and trade expression sit in Trigger and Trade; here is only why regulation can bite margins slowly then suddenly.\n\nDEPTH4 tracks it as a cash-flow drag: compliance spend rises before growth reaccelerates.",
    oneLineSummary:
      "EU enforcement is moving from fines to binding product limits the tape has not repriced.",
    thesisStatement:
      "META should underperform over the next few months if EU platform rules tighten on binding remedies and daily fines that change how ads run.",
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
        "Global platform rules stay a headwind for ad-heavy megacaps — that theme sits behind regulation theses on the book this year.",
    },

    hiddenDriver: "Behavior rules hit revenue lines; fines were only the opening act.",
    likelyPath: "Binding order → compliance spend rises → guides cut → stock derates in steps.",
    marketMisread: "",
    tradeExpression: "META downside skew into EU enforcement headlines; hard stop above prior highs.",

    whyNow: "Enforcement is entering the binding phase — that is when the downside path pays.",
    whatsUnpriced:
      "US flow still prices EU risk as a settled check while remedy language already forces product changes that hit attach rates and ad load. The edge is profit forecasts look high relative to ongoing compliance and revenue mechanics shifts — not relative to the last fine headline alone.",
    trigger:
      "Published binding remedy that forces product change OR two weeks of EU daily fines with no legal stay.",
    trade:
      "Fade META into strength using Trade plan entry, stop, and cover zones; increase size only after binding remedy or sustained fines confirm the revenue path is shifting. Legal stays that remove teeth mean cover — see Invalidation.",
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
  return CATALOG_THESES.find((t) => t.slug === slug);
}

/** Per-thesis resolution paths — one trade, three outcomes; thesis-specific drivers (retail voice constitution). */
export function catalogDefaultScenariosForThesis(thesis: Thesis): ThesisScenario[] {
  const { slug, id } = thesis;
  const sym = thesis.asset;

  const row = (
    sc: 1 | 2 | 3,
    pathKey: ThesisScenarioPathKey,
    probability: number,
    confirmation: string,
    marketConsequence: string,
  ): ThesisScenario => ({
    id: `${slug}-sc${sc}`,
    thesisId: id,
    pathKey,
    label: pathKey === "clean_win" ? "Clean win" : pathKey === "messy_win" ? "Messy win" : "Thesis broken",
    probability,
    confirmation,
    marketConsequence,
  });

  switch (slug) {
    case "war-peace-gold-short":
      return [
        row(
          1,
          "clean_win",
          40,
          "Calm geopolitical weeks stack, ETF flows show funds trimming war hedges on GLD, and XAU spot bleeds the fear bid without a new strike.",
          "The GLD / XAU short pays close to plan; scale toward Trade plan targets and trail using the levels you already set — no new entry story here.",
        ),
        row(
          2,
          "messy_win",
          35,
          "Talks keep progressing but gold chops on mixed headlines: surprise CPI, fake escalation tweets, or GLD flow noise spike the tape while the broader drift still favors lower.",
          "Direction is still right but payoff is slower and uglier; keep the short smaller, widen patience, and lean on risk lines in Trade plan.",
        ),
        row(
          3,
          "thesis_broken",
          25,
          "A kinetic headline returns, GLD gaps through your stop band, or spot holds above the weekly invalidation in your book.",
          "Thesis is wrong or early; follow Invalidation and retire or sharply cut the short per Book — do not rationalize new risk.",
        ),
      ];
    case "strait-hormuz-oil-long":
      return [
        row(
          1,
          "clean_win",
          40,
          "Verified friction on the strait route or a sharp benchmark freight spike within days while navy and insurer language hardens.",
          "USO gaps and trends toward upper targets; add only on your Trade plan with gap-aware stops — still one Hormuz long, not a fresh punt.",
        ),
        row(
          2,
          "messy_win",
          35,
          "Gulf headlines run hot but there is no verified closure yet; crude oscillates as inventory prints fight routing fear.",
          "Jump-risk long stays valid but choppy; size for ranges until freight or policy confirms the squeeze window.",
        ),
        row(
          3,
          "thesis_broken",
          25,
          "Official stand-down plus a week of calm insurance quotes and normal tanker flows — chokepoint fear never converts to price.",
          "Exit the Hormuz USO long per Invalidation; log it clean in Book.",
        ),
      ];
    case "opec-unity-fracturing":
      return [
        row(
          1,
          "clean_win",
          40,
          "US shale slows, OPEC holds the line, and rig data plus cartel language keep the tight-supply story intact through the quarter.",
          "The long USO thesis pays close to plan; scale into strength toward targets and follow your normal trailing rules in Trade plan.",
        ),
        row(
          2,
          "messy_win",
          35,
          "Supply is roughly tight, but headlines are noisy: surprise inventory builds, political noise, and mixed data keep oil choppy.",
          "Thesis is still broadly right but payoff is slower; keep the long but size more cautiously and lean on risk management in Trade plan.",
        ),
        row(
          3,
          "thesis_broken",
          25,
          "Rigs re-accelerate or OPEC cohesion cracks in headlines and data — the market reads spare barrels as easy again.",
          "Thesis is wrong or early; follow Invalidation and retire or sharply reduce the USO long per Book.",
        ),
      ];
    case "fed-pivot-delayed-tlt-weakness":
      return [
        row(
          1,
          "clean_win",
          40,
          "Hot CPI or payrolls plus Fed speakers pushing the first cut into next year; long Treasury prices sell as the curve reprices slower easing.",
          "The TLT short pays in line with the delay-cut read; fade strength per Trade plan and respect the next data cluster.",
        ),
        row(
          2,
          "messy_win",
          35,
          "Inflation and jobs prints chop month to month; TLT whipaws around where futures price the first cut while the Fed still sounds cautious.",
          "Higher-for-longer bias can still win but path is noisy; keep size tactical and expect a longer clock than one print.",
        ),
        row(
          3,
          "thesis_broken",
          25,
          "Core CPI cools two prints in a row and payrolls soften together — the window for aggressive Fed pushback closes.",
          "Cover the TLT short per Invalidation; the late-cut repricing thesis is not the right frame.",
        ),
      ];
    case "us-defense-repricing-rtx-lmt":
      return [
        row(
          1,
          "clean_win",
          40,
          "Two named Pentagon awards hit the tape plus stable supply commentary on the call; backlog lines in filings step up clearly.",
          "RTX grinds toward upper targets; add only after booked work confirms, trailing per Trade plan.",
        ),
        row(
          2,
          "messy_win",
          35,
          "Awards trickle while RTX tracks the broad market; backlog creeps up but headlines stay political and noisy.",
          "Upside thesis still alive but payoff is stepwise; accumulate on dips, avoid hero sizing until filing lines prove the path.",
        ),
        row(
          3,
          "thesis_broken",
          25,
          "Major program cancel or funding pulled from the line — the order-book story breaks.",
          "Exit RTX longs fast per Invalidation; do not average a broken award thesis.",
        ),
      ];
    case "ai-capex-squeeze-qqq-rotation":
      return [
        row(
          1,
          "clean_win",
          40,
          "Back-to-back earnings weeks where several non-leader QQQ names cut margins on AI-related spend while mega-cap gloss cannot hide the cluster.",
          "Margin-squeeze watch becomes actionable: trim broad QQQ adds and rotate toward cash-heavy leaders or hedges exactly as your Trade plan spells out.",
        ),
        row(
          2,
          "messy_win",
          35,
          "Mixed margin guides and mega-cap strength mask weak tail names; QQQ ranges while AI spend headlines argue both ways.",
          "Thesis direction still plausible but unconfirmed; stay on watch with minimal size until the margin cluster is obvious.",
        ),
        row(
          3,
          "thesis_broken",
          25,
          "Margins hold and AI spend guides stabilize — the index absorbs the build-out without the feared squeeze showing up.",
          "Stand down the QQQ margin-watch thesis; do not force a new broad index bet from this lens.",
        ),
      ];
    case "china-stimulus-copper-long":
      return [
        row(
          1,
          "clean_win",
          40,
          "Two consecutive draws in Shanghai bonded stocks and a confirming credit impulse print in the same month.",
          "HG extends toward restock targets; scale toward Trade plan levels as inventory and credit align.",
        ),
        row(
          2,
          "messy_win",
          35,
          "Beijing stimulus rhetoric runs hot but bonded stocks do not draw yet; copper mean-reverts on every PMI headline.",
          "China impulse thesis still possible but delayed; keep HG small until warehouse and credit lines agree.",
        ),
        row(
          3,
          "thesis_broken",
          25,
          "Property panic headlines return with force or a sharp USD funding spike hits — restock story loses the tape.",
          "Cover the HG long per Invalidation; log the miss in Book.",
        ),
      ];
    case "eu-tech-crackdown-megacap":
      return [
        row(
          1,
          "clean_win",
          40,
          "Binding EU remedy forces real product change or daily fines stick without a legal stay; ads and app flows tighten faster than sell-side models assume.",
          "META derates toward your downside zone; lean on Trade plan adds and trails, not a new short campaign invented here.",
        ),
        row(
          2,
          "messy_win",
          35,
          "Brussels headlines chop META while remedies grind through courts; revenue impact is real but the tape fights every headline.",
          "Regulation short stays valid but path is choppier; size lighter and keep invalidation tight.",
        ),
        row(
          3,
          "thesis_broken",
          25,
          "Court stay or settlement removes enforceable product limits — the revenue bite thesis loses teeth.",
          "Cover the META short per Invalidation; regulation fade is no longer the driver.",
        ),
      ];
    default:
      return [
        row(
          1,
          "clean_win",
          40,
          `Drivers you named for ${sym} line up in data and price within your window — the thesis basically works.`,
          `The existing ${sym} trade pays closer to plan; follow Trade plan for adds, targets, and trails.`,
        ),
        row(
          2,
          "messy_win",
          35,
          `Evidence for ${sym} stays two-way: the story drifts your way but prints and headlines keep resetting conviction.`,
          `Payoff is slower and choppier; keep size cautious and lean on risk lines until the tape clears.`,
        ),
        row(
          3,
          "thesis_broken",
          25,
          `Your stated invalidation for ${sym} prints — conditions show the thesis is wrong or flipped.`,
          `Stand down per Invalidation and Book; do not open a new unrelated bet from this block.`,
        ),
      ];
  }
}

function defaultDetail(slug: string): ThesisDetailBundle {
  const thesis = getThesisBySlug(slug)!;
  return {
    thesis,
    evidence: [],
    scenarios: catalogDefaultScenariosForThesis(thesis),
    advisoryLog: [],
    relatedAssets: [{ symbol: thesis.asset, note: "Primary" }],
  };
}

export function getThesisDetail(slug: string): ThesisDetailBundle | undefined {
  const t = getThesisBySlug(slug);
  if (!t) return undefined;
  const bundle = defaultDetail(slug);
  return { ...bundle, thesis: normalizeThesisNarrativeFields(bundle.thesis) };
}

export function thesisTitleById(id: string): string {
  const t = CATALOG_THESES.find((x) => x.id === id);
  return t ? getThesisDisplayTitle(t) : "—";
}

export function thesisSlugById(id: string): string | undefined {
  return CATALOG_THESES.find((t) => t.id === id)?.slug;
}

/** Micro-label for catalog theses; null when absent. */
export function thesisMicroLabelById(id: string): string | null {
  const t = CATALOG_THESES.find((x) => x.id === id);
  return t ? formatThesisMicroLabel(t.microLabel) : null;
}

export function thesisStatusById(id: string) {
  return CATALOG_THESES.find((t) => t.id === id)?.status ?? "watching";
}
