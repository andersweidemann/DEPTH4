import type { Thesis as ApiThesis, ThesisAssessment } from "@/types/thesis";
import { inferAssetClassFromTicker } from "@/lib/thesis-helpers";
import { advisoryHeadlineFromResolutionPaths } from "@/lib/thesis-engine-v2/advisory-from-resolution-paths";
import {
  formatEntryZoneLabel,
  formatTradePlanPrice,
  type ComputeLiveTradePlanResult,
} from "@/lib/thesis-engine-v2/live-trade-plan";
import { getThesisMispricing, type ThesisMispricing } from "@/lib/thesis-engine-v2/mispricing";
import { THESIS_DEPTH_TIMEFRAMES, type ThesisDepthKey } from "@/lib/thesis-engine-v2/thesis-depth-canonical";
import { displayConvictionPctFromEngineThesis } from "@/lib/thesis-engine-v2/thesis-display-selectors";
import {
  buildDisplayScenariosFromThesis,
  isCatalogThesisId,
  isUncalibratedDisplayScenarioTriple,
} from "@/lib/thesis-engine-v2/thesis-display-scenarios";
import type {
  LiveTradePlan,
  Thesis,
  ThesisDetailBundle,
  ThesisScenario,
} from "@/lib/thesis-engine-v2/types";

export function mapStatus(status: Thesis["status"]): ApiThesis["status"] {
  switch (status) {
    case "ready":
      return "Ready";
    case "active":
      return "Active";
    case "watching":
      return "Watching";
    case "forming":
    case "resolved":
    case "invalidated":
    default:
      return "Draft";
  }
}

function mapDirection(d: Thesis["direction"]): "long" | "short" {
  return d === "short" ? "short" : "long";
}

function scenariosToResolutionPaths(scenarios: ThesisScenario[]) {
  const byKey = Object.fromEntries(scenarios.map((s) => [s.pathKey, s])) as Partial<
    Record<ThesisScenario["pathKey"], ThesisScenario>
  >;
  const clean = byKey.clean_win;
  const messy = byKey.messy_win;
  const broken = byKey.thesis_broken;
  return {
    cleanWin: {
      probability: clean?.probability ?? 0,
      whatHappens: clean?.confirmation ?? "",
      tradeImpact: clean?.marketConsequence ?? "",
    },
    messyWin: {
      probability: messy?.probability ?? 0,
      whatHappens: messy?.confirmation ?? "",
      tradeImpact: messy?.marketConsequence ?? "",
    },
    thesisBroken: {
      probability: broken?.probability ?? 0,
      whatHappens: broken?.confirmation ?? "",
      tradeImpact: broken?.marketConsequence ?? "",
    },
  };
}

function mispricingComponents(mp: ThesisMispricing): ApiThesis["mispricingComponents"] {
  const pick = (id: "structural" | "path_shape" | "conviction_alignment" | "live_evidence") =>
    mp.components.find((c) => c.id === id)?.value ?? 0;
  return {
    structuralSetup: pick("structural"),
    resolutionPathShape: pick("path_shape"),
    convictionAlignment: pick("conviction_alignment"),
    evidenceFreshness: pick("live_evidence"),
    convictionVsSetup: mp.convictionVsSetupGap,
  };
}

function buildFourLevelCascade(thesis: Thesis): ApiThesis["fourLevelCascade"] {
  if (thesis.thesisCascade) {
    const c = thesis.thesisCascade;
    return {
      l1: {
        timeframe: "L1 · Confirmed (today)",
        label: "What is already true",
        description: c.l1Confirmed,
      },
      l2: {
        timeframe: "L2 · This week / quarter",
        label: "Headlines, earnings window, first tape move",
        description: c.l2ThisQuarter,
      },
      l3: {
        timeframe: "L3 · This year",
        label: "How the trade pays out across the calendar",
        description: c.l3ThisYear,
      },
      l4: {
        timeframe: "L4 · 2026 backdrop",
        label: "Bias for every DEPTH4 thesis this year",
        description: c.l4Backdrop2026,
      },
    };
  }
  if (thesis.thesisDepthBook?.nodes) {
    const keys: ThesisDepthKey[] = ["depth_1", "depth_2", "depth_3", "depth_4"];
    const apiKeys = ["l1", "l2", "l3", "l4"] as const;
    const book = thesis.thesisDepthBook;
    const out: ApiThesis["fourLevelCascade"] = {
      l1: { timeframe: "", label: "", description: "" },
      l2: { timeframe: "", label: "", description: "" },
      l3: { timeframe: "", label: "", description: "" },
      l4: { timeframe: "", label: "", description: "" },
    };
    keys.forEach((dk, i) => {
      const node = book.nodes[dk];
      const tf = THESIS_DEPTH_TIMEFRAMES[dk];
      const parts = tf.label.split("·").map((s) => s.trim());
      const k = apiKeys[i]!;
      out[k] = {
        timeframe: node?.timeframe ?? tf.label,
        label: parts[1] ?? parts[0] ?? tf.label,
        description: node?.claim ?? "",
      };
    });
    return out;
  }
  const fallback = (s: string) => s || "";
  return {
    l1: {
      timeframe: "L1 · Now",
      label: "Setup",
      description: fallback(thesis.whyNow),
    },
    l2: {
      timeframe: "L2 · Near term",
      label: "Path",
      description: fallback(thesis.hiddenDriver),
    },
    l3: {
      timeframe: "L3 · Medium term",
      label: "Tape",
      description: fallback(thesis.likelyPath),
    },
    l4: {
      timeframe: "L4 · Structural",
      label: "Backdrop",
      description: fallback(thesis.tradeExpression),
    },
  };
}

function levelsComplete(plan: LiveTradePlan): boolean {
  if (!plan.ready) return false;
  const ez = formatEntryZoneLabel(plan);
  return !!(ez && plan.stop != null && plan.target1 != null && plan.target2 != null);
}

function mapTradePlan(thesis: Thesis, live: ComputeLiveTradePlanResult | null): ApiThesis["tradePlan"] {
  const plan = live?.trade_plan ?? null;
  const blocked = plan?.conviction_blocked === true;
  const showLive = plan != null && levelsComplete(plan) && !blocked;

  const statusStr = blocked
    ? "Conviction below minimum — geometry withheld"
    : showLive
      ? "Live levels ready"
      : "Awaiting actionable setup or quotes";

  const rrCheck = plan?.rr_check_label?.trim() ?? "";

  let rrWarning =
    "Estimated from the latest daily close and recent volatility (ATR) — verify levels against your broker.";
  if (blocked) {
    rrWarning =
      "Entry zone withheld while thesis conviction is below 50% — raise path conviction or wait for cleaner odds before sizing.";
  } else if (plan?.levels_need_adjustment && plan.rr_check_label) {
    rrWarning = plan.rr_check_label;
  } else if (plan?.rr_check_label && !plan.levels_need_adjustment) {
    rrWarning = plan.rr_check_label;
  }

  const PENDING_ENTRY = "Awaiting live setup";
  const PENDING_STOP = "Will appear with a valid trigger";
  const PENDING_TGT = "Pending live plan";

  const entryZone =
    showLive && plan ? (formatEntryZoneLabel(plan) ?? PENDING_ENTRY) : blocked ? "—" : PENDING_ENTRY;
  const stop =
    showLive && plan && plan.stop != null ? formatTradePlanPrice(plan.stop) : blocked ? "—" : PENDING_STOP;
  const target1 =
    showLive && plan && plan.target1 != null ? formatTradePlanPrice(plan.target1) : blocked ? "—" : PENDING_TGT;
  const target2 =
    showLive && plan && plan.target2 != null ? formatTradePlanPrice(plan.target2) : blocked ? "—" : PENDING_TGT;

  const stopColor: "red" | "zinc" = blocked || plan?.levels_need_adjustment ? "red" : "zinc";

  const recLabels: Record<string, string> = {
    watch: "Watch — wait for the trigger you wrote.",
    enter: "Enter — size only when your setup and risk limits align.",
    hold: "Hold — thesis intact; manage risk.",
    reduce: "Reduce — lock partial; elevated uncertainty.",
    exit: "Exit — invalidation or thesis closed.",
  };
  const recommendation = recLabels[thesis.advisoryAction] ?? thesis.advisoryAction;

  let recommendationColor: "emerald" | "amber" | "red" = "amber";
  if (thesis.advisoryAction === "exit") recommendationColor = "red";
  else if (thesis.advisoryAction === "enter" && plan?.rr_check_ok === true && showLive)
    recommendationColor = "emerald";
  else if (thesis.advisoryAction === "enter") recommendationColor = "amber";

  return {
    status: statusStr,
    rrCheck,
    rrWarning,
    entryZone,
    stop,
    stopColor,
    target1,
    target2,
    timeHorizon: thesis.horizon,
    recommendation,
    recommendationColor,
  };
}

export function mapBundleToApiThesis(
  bundle: ThesisDetailBundle,
  live: ComputeLiveTradePlanResult | null,
  options?: { liveEvidenceCount?: number },
): ApiThesis {
  const thesis = bundle.thesis;
  const mp = getThesisMispricing(thesis, { liveEvidenceCount: options?.liveEvidenceCount });
  const conviction = displayConvictionPctFromEngineThesis(thesis);
  /** Same merge as `ThesisDetailClient` / list engine — do not use raw `bundle.scenarios` for API path %. */
  const displayScenarios = buildDisplayScenariosFromThesis(thesis, bundle.scenarios);
  const cleanPct = displayScenarios.find((s) => s.pathKey === "clean_win")?.probability ?? 0;
  const messyPct = displayScenarios.find((s) => s.pathKey === "messy_win")?.probability ?? 0;
  const brokenPct = displayScenarios.find((s) => s.pathKey === "thesis_broken")?.probability ?? 0;
  const convictionIsTemplateEstimate = isUncalibratedDisplayScenarioTriple(displayScenarios);

  const showResolutionPathPercentages =
    !isUncalibratedDisplayScenarioTriple(displayScenarios) ||
    isCatalogThesisId(thesis.id) ||
    Boolean(bundle.scenarioProbabilitiesFromDb);

  const advisory = advisoryHeadlineFromResolutionPaths(
    cleanPct,
    messyPct,
    brokenPct,
    thesis.advisoryAction,
  );

  const plan = live?.trade_plan ?? null;
  const blocked = plan?.conviction_blocked === true;
  const showLive = plan != null && levelsComplete(plan) && !blocked;
  const actionable = thesis.status === "ready" || thesis.status === "active";
  const directional = thesis.direction === "long" || thesis.direction === "short";
  const isEntryValid =
    actionable &&
    directional &&
    showLive &&
    !blocked &&
    (thesis.advisoryAction === "enter" || thesis.advisoryAction === "hold");

  const description =
    thesis.whyThesisExists?.trim() ||
    [thesis.hiddenDriver, thesis.likelyPath].filter(Boolean).join("\n\n") ||
    "";

  const summary =
    thesis.oneLineSummary?.trim() || thesis.microLabel?.trim() || thesis.title || "";

  const relatedAssets = bundle.relatedAssets.map((a, i) => ({
    symbol: a.symbol,
    type: (i === 0 ? "Primary" : "Secondary") as "Primary" | "Secondary",
  }));

  return {
    slug: thesis.slug,
    title: thesis.title,
    statement: thesis.thesisStatement,
    summary,
    description,
    asset: thesis.asset,
    assetClass: inferAssetClassFromTicker(thesis.asset),
    direction: mapDirection(thesis.direction),
    status: mapStatus(thesis.status),
    tradeable: thesis.qualification === "tradeable",
    conviction,
    convictionIsTemplateEstimate,
    convictionRationale: thesis.probabilityRationale,
    mispricingScore: mp.score,
    mispricingComponents: mispricingComponents(mp),
    horizon: thesis.horizon,
    advisory,
    invalidation: thesis.invalidation,
    whyNow: thesis.whyNow,
    whatMarketHasntPriced: thesis.whatsUnpriced,
    trigger: thesis.trigger,
    trade: thesis.trade,
    timeStop: thesis.timeStop ?? "",
    isEntryValid,
    showResolutionPathPercentages,
    resolutionPaths: scenariosToResolutionPaths(displayScenarios),
    fourLevelCascade: buildFourLevelCascade(thesis),
    tradePlan: mapTradePlan(thesis, live),
    insiderFlow: {
      bullInstruments: thesis.insiderFlow?.bullInstruments ?? [],
      bearInstruments: thesis.insiderFlow?.bearInstruments ?? [],
      confirmTags: thesis.insiderFlow?.confirmTags ?? [],
      contradictTags: thesis.insiderFlow?.contradictTags ?? [],
    },
    relatedAssets,
    lastUpdated: thesis.lastUpdated,
  };
}

export function mapToThesisAssessment(thesis: Thesis): ThesisAssessment {
  return {
    headline: thesis.microLabel?.trim() || thesis.title,
    context: [thesis.hiddenDriver, thesis.likelyPath].filter(Boolean).join(" — ") || "",
    considerations: thesis.riskFactors?.trim() || "",
    riskFactors: thesis.riskFactors?.trim() || thesis.invalidation || "",
    whyThisThesisExists: thesis.whyThesisExists?.trim() || "",
    convictionRationale: thesis.probabilityRationale || "",
  };
}
