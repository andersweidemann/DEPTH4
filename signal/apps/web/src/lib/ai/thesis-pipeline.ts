import type { EventCategory, TimeDepth, AssetDepth } from "@/types/causal-graph";
import type { IncentiveAnalysis } from "@/types/incentive-analysis";
import { parseIncentiveAnalysis } from "@/lib/thesis/incentive-analysis";
import { inferAssetDepth, inferTimeDepth } from "@/lib/causal-matrix/build-matrix";
import type { PipelineLlmClient } from "@/lib/ai/thesis-pipeline-llm";
import type { PipelineAsset } from "@/lib/ai/thesis-pipeline-context";
import type {
  AffectedAssetPropagation,
  CausalPropagationResult,
  DetectedEvent,
  PipelineNewsItem,
  ThesisCandidate,
} from "@/lib/ai/thesis-pipeline-types";
import { INCENTIVE_CONFIDENCE_MIN, MISPRICING_SCORE_MIN } from "@/lib/ai/thesis-pipeline-types";
import {
  candidateNeedsDetailEnrichment,
  isResolutionPathsComplete,
  isTradePlanComplete,
} from "@/lib/ai/thesis-pipeline-body";
import type { QualityGateInput } from "@/lib/thesis/quality-gate";

const EVENT_CATEGORIES = new Set<EventCategory>([
  "geopolitics",
  "monetary_policy",
  "fiscal_policy",
  "commodity_supply",
  "demand_shock",
  "technology",
  "climate",
  "trade_policy",
]);

const TIME_DEPTHS = new Set<TimeDepth>(["L1_confirmed", "L2_this_week", "L3_this_month", "L4_this_quarter"]);
const ASSET_DEPTHS = new Set<AssetDepth>(["root", "direct", "indirect", "speculative"]);

export function logPipelineStage(stage: string, detail: Record<string, unknown>): void {
  console.info(JSON.stringify({ depth4_thesis_pipeline: true, stage, ...detail }));
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parseCategory(raw: unknown): EventCategory {
  const c = str(raw) as EventCategory;
  return EVENT_CATEGORIES.has(c) ? c : "geopolitics";
}

function parseTimeDepth(raw: unknown, fallbackHorizon: string): TimeDepth {
  const t = str(raw) as TimeDepth;
  if (TIME_DEPTHS.has(t)) return t;
  return inferTimeDepth(fallbackHorizon);
}

function parseAssetDepth(raw: unknown, strength: number): AssetDepth {
  const d = str(raw) as AssetDepth;
  if (ASSET_DEPTHS.has(d)) return d;
  return inferAssetDepth(strength);
}

/** Fix LLM mismatch where reasoning says prices fall but direction is tagged up (common on small models). */
export function reconcileAffectDirection(
  reasoning: string,
  declared: "up" | "down" | "neutral",
): "up" | "down" | "neutral" {
  if (declared === "neutral") return declared;
  const lower = reasoning.toLowerCase();
  const downHits = (
    lower.match(
      /\b(decrease|decreases|decreasing|lower|fall|falls|falling|drop|drops|decline|declines|weaken|deflate|contract|unwind|erod|downside|short|fade|sink|tumble|bearish|downward)\b/g,
    ) ?? []
  ).length;
  const upHits = (
    lower.match(
      /\b(increase|increases|rise|rises|rising|rally|rallies|surge|strengthen|lift|climb|bid|higher|bullish|rebound|recover|upside|long)\b/g,
    ) ?? []
  ).length;
  if (downHits > upHits && declared === "up") return "down";
  if (upHits > downHits && declared === "down") return "up";
  return declared;
}

const GOLD_SAFE_HAVEN_SYMBOLS = new Set([
  "XAUUSD",
  "GC.1",
  "GC",
  "GLD",
  "IAU",
  "GDX",
  "XAU",
  "SLV",
]);

const DE_ESCALATION_EVENT_RE =
  /\b(ceasefire|de-escalat|tensions?\s+ease|easing tensions|peace talk|diplomatic progress|military activity drop|conflict resolution|war to continue)\b/i;

/** Small models often tag gold UP on “reduced tensions” — safe-haven premium fades on de-escalation. */
export function reconcileSafeHavenForDeescalation(
  eventTitle: string,
  eventDescription: string,
  symbol: string,
  reasoning: string,
  direction: "up" | "down" | "neutral",
): "up" | "down" | "neutral" {
  const sym = symbol.toUpperCase();
  if (!GOLD_SAFE_HAVEN_SYMBOLS.has(sym) && !sym.includes("XAU") && !sym.includes("GOLD")) {
    return direction;
  }
  const eventText = `${eventTitle} ${eventDescription}`;
  if (!DE_ESCALATION_EVENT_RE.test(eventText)) return direction;

  const r = reasoning.toLowerCase();
  const deEscalationCue =
    /\b(reduced tensions?|tensions ease|de-escalat|ceasefire|peace|less geopolitical|risk premium fade|safe-haven unw|war premium|military activity drop)\b/.test(
      r,
    );
  if (!deEscalationCue) return direction;

  const explicitHavenBid =
    /\b(safe-haven bid|flight to quality|war risk rise|escalat|geopolitical risk rise|haven demand increase|risk-off bid)\b/.test(
      r,
    );
  if (explicitHavenBid) return direction;
  return "down";
}

export function selectThesisMispricingTarget(
  affectedAssets: AffectedAssetPropagation[],
  minScore = MISPRICING_SCORE_MIN,
): AffectedAssetPropagation | null {
  const eligible = affectedAssets
    .filter((a) => a.mispricingScore >= minScore)
    .sort((a, b) => b.mispricingScore - a.mispricingScore);
  return eligible[0] ?? null;
}

function parseIncentiveFromLlm(raw: unknown): IncentiveAnalysis | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const nested = o.incentive_analysis ?? o.incentiveAnalysis;
  return parseIncentiveAnalysis(nested ?? raw);
}

export function qualityGateInputFromPipelineCandidate(
  candidate: ThesisCandidate,
  propagation: CausalPropagationResult,
  incentive: IncentiveAnalysis,
  slug: string,
): QualityGateInput {
  return {
    slug,
    title: candidate.title,
    statement: candidate.statement,
    targetAssetSymbol: candidate.targetAssetSymbol,
    direction: candidate.direction,
    conviction: candidate.conviction,
    timeHorizon: candidate.timeHorizon,
    affects: propagation.affectedAssets.map((a) => ({
      assetSymbol: a.asset.symbol,
      direction: a.direction,
    })),
    incentive_analysis: incentive,
    entryZone: candidate.tradePlan.entryZone,
    stop: candidate.tradePlan.stop,
    target1: candidate.tradePlan.target1,
    bodyTradePlan: {
      entry_zone: candidate.tradePlan.entryZone,
      stop: candidate.tradePlan.stop,
      target1: candidate.tradePlan.target1,
    },
    bodyEvidence: candidate.evidence,
    bodyResolutionPaths: candidate.resolutionPaths,
  };
}

function parseTradePlanFromLlm(raw: unknown): ThesisCandidate["tradePlan"] | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const tp = (o.trade_plan ?? o.tradePlan) as Record<string, unknown> | undefined;
  if (!tp) return null;
  return {
    entryZone: str(tp.entry_zone ?? tp.entryZone) || "—",
    stop: str(tp.stop) || "—",
    target1: str(tp.target1) || "—",
    target2: str(tp.target2) || "—",
  };
}

function parseResolutionFromLlm(raw: unknown): ThesisCandidate["resolutionPaths"] | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const rp = (o.resolution_paths ?? o.resolutionPaths) as Record<string, unknown> | undefined;
  if (!rp) return null;
  return {
    clean: str(rp.clean) || "",
    messy: str(rp.messy) || "",
    broken: str(rp.broken) || "",
  };
}

function parseEvidenceFromLlm(raw: unknown): ThesisCandidate["evidence"] {
  if (!raw || typeof raw !== "object") return [];
  const o = raw as Record<string, unknown>;
  const evidenceRaw = o.evidence;
  if (!Array.isArray(evidenceRaw)) return [];
  return evidenceRaw
    .map((e) => {
      if (!e || typeof e !== "object") return null;
      const ex = e as Record<string, unknown>;
      const excerpt = str(ex.excerpt);
      if (!excerpt) return null;
      return {
        date: str(ex.date) || new Date().toISOString().slice(0, 10),
        source: str(ex.source) || "news",
        excerpt,
        url: str(ex.url) || null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .slice(0, 6);
}

export function mergeThesisCandidateDetails(
  base: ThesisCandidate,
  patch: {
    tradePlan?: ThesisCandidate["tradePlan"];
    resolutionPaths?: ThesisCandidate["resolutionPaths"];
    evidence?: ThesisCandidate["evidence"];
  },
): ThesisCandidate {
  const tradePlan = patch.tradePlan && isTradePlanComplete(patch.tradePlan) ? patch.tradePlan : base.tradePlan;
  const resolutionPaths =
    patch.resolutionPaths && isResolutionPathsComplete(patch.resolutionPaths)
      ? patch.resolutionPaths
      : base.resolutionPaths;
  const evidence =
    patch.evidence && patch.evidence.length >= 3
      ? patch.evidence
      : patch.evidence && patch.evidence.length > base.evidence.length
        ? patch.evidence
        : base.evidence;

  return { ...base, tradePlan, resolutionPaths, evidence };
}

/** Step 4b — fill trade plan, evidence, and resolution paths when step 4 JSON is thin. */
export async function step4b_generateThesisDetails(
  candidate: ThesisCandidate,
  detectedEvent: DetectedEvent,
  llm: PipelineLlmClient,
): Promise<{
  tradePlan?: ThesisCandidate["tradePlan"];
  resolutionPaths?: ThesisCandidate["resolutionPaths"];
  evidence?: ThesisCandidate["evidence"];
} | null> {
  const prompt = [
    "You are DEPTH4's trade-plan writer. Given this macro thesis, output actionable detail JSON only.",
    "",
    `Title: ${candidate.title}`,
    `Statement: ${candidate.statement}`,
    `Direction: ${candidate.direction} (down = short, up = long)`,
    `Asset: ${candidate.targetAssetSymbol}`,
    `Conviction: ${candidate.conviction}%`,
    `Time horizon: ${candidate.timeHorizon}`,
    `Event: ${detectedEvent.title}`,
    "",
    "Generate:",
    "1. TRADE PLAN with specific price levels (not TBD): entry_zone, stop, target1, target2",
    "2. EVIDENCE: 3-5 items with date (YYYY-MM-DD), source, excerpt",
    "3. RESOLUTION PATHS: clean (confirms thesis), messy (partial), broken (invalidates)",
    "",
    'Output JSON: {"trade_plan":{"entry_zone":"...","stop":"...","target1":"...","target2":"..."},',
    '"evidence":[{"date":"...","source":"...","excerpt":"..."}],',
    '"resolution_paths":{"clean":"...","messy":"...","broken":"..."}}',
  ].join("\n");

  const raw = await llm.completeJson(prompt, 900);
  if (!raw || typeof raw !== "object") return null;
  return {
    tradePlan: parseTradePlanFromLlm(raw) ?? undefined,
    resolutionPaths: parseResolutionFromLlm(raw) ?? undefined,
    evidence: parseEvidenceFromLlm(raw),
  };
}

export function pickHighestMispricing(
  rows: Array<{ mispricing_score?: number; mispricingScore?: number } & Record<string, unknown>>,
): (typeof rows)[number] | null {
  const sorted = rows
    .map((a) => ({
      ...a,
      score: num(a.mispricing_score ?? a.mispricingScore, num(a.strength, 0) - num(a.priced_in_percent ?? a.pricedInPercent, 0)),
    }))
    .filter((a) => a.score > 0)
    .sort((a, b) => b.score - a.score);
  return sorted[0] ?? null;
}

export async function step1_detectEvent(
  newsItems: PipelineNewsItem[],
  llm: PipelineLlmClient,
): Promise<DetectedEvent | null> {
  const prompt = [
    "You are DEPTH4's event detection engine. Read these news items together and identify the SINGLE underlying causal event (not one headline in isolation).",
    "",
    "News items:",
    ...newsItems.map((n) => `- [${n.source}] ${n.headline}`),
    "",
    'A "causal event" is NOT a news headline. It is the underlying SHIFT in the macro environment that will affect asset prices.',
    "",
    "Output JSON:",
    '{"event":{"title":"...","category":"geopolitics|monetary_policy|...","description":"...","confidence":0-100,"key_headlines":["..."]}}',
    "",
    "Rules: active title (5-8 words); description explains WHO acts and WHAT they must do.",
  ].join("\n");

  const raw = await llm.completeJson(prompt, 500);
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const ev = (o.event ?? o) as Record<string, unknown>;
  const title = str(ev.title);
  if (!title) return null;

  const headlines = Array.isArray(ev.key_headlines)
    ? ev.key_headlines.map((h) => str(h)).filter(Boolean)
    : newsItems.map((n) => n.headline).slice(0, 5);

  return {
    title,
    category: parseCategory(ev.category),
    description: str(ev.description) || title,
    confidence: clamp(Math.round(num(ev.confidence, 50)), 0, 100),
    sourceHeadlines: headlines,
    firstDetected: new Date().toISOString(),
  };
}

export async function step2_incentiveAnalysis(
  detectedEvent: DetectedEvent,
  llm: PipelineLlmClient,
): Promise<IncentiveAnalysis | null> {
  const prompt = [
    "You are DEPTH4's incentive analysis engine. Given this macro event, identify the key actors and their incentive structures.",
    "",
    `Event: "${detectedEvent.title}"`,
    `Description: ${detectedEvent.description}`,
    "",
    "Apply: ACTOR → GOAL → CONSTRAINT → REQUIRED ACTION → alternatives → most likely action → confidence → time window → catalysts.",
    "",
    "Return ONLY valid JSON with this exact shape (snake_case keys, confidence as integer 0-100):",
    '{"incentive_analysis":{"actor":"Specific leader or institution","goal":"What they must achieve",',
    '"constraint":"What blocks them","required_action":"What they must do","alternative_actions":["..."],',
    '"most_likely_action":"Probable path","confidence":72,"time_window":"When","catalyst_events":["..."],',
    '"reasoning":"2-3 sentences"}}',
    "",
    "For geopolitical de-escalation: name a specific administration or negotiator, election timing, and peace/de-escalation lever.",
    "If truly no actor, set confidence to 0 — otherwise confidence should be 55-90 when actor and path are clear.",
  ].join("\n");

  const maxTokens = 1200;
  let raw = await llm.completeJson(prompt, maxTokens);
  let parsed = parseIncentiveFromLlm(raw);
  if (!parsed) {
    logPipelineStage("incentive_parse_retry", {
      raw_type: raw === null ? "null" : typeof raw,
      top_keys:
        raw && typeof raw === "object" && !Array.isArray(raw)
          ? Object.keys(raw as object).slice(0, 12)
          : [],
    });
    raw = await llm.completeJson(
      `${prompt}\n\nPRIOR OUTPUT WAS INVALID OR INCOMPLETE. Return ONLY the incentive_analysis JSON object with all required keys.`,
      maxTokens,
    );
    parsed = parseIncentiveFromLlm(raw);
  }
  if (!parsed) {
    logPipelineStage("incentive_parse_failed", {});
    return null;
  }
  if (parsed.confidence < INCENTIVE_CONFIDENCE_MIN) {
    logPipelineStage("incentive_stopped", {
      confidence: parsed.confidence,
      min: INCENTIVE_CONFIDENCE_MIN,
    });
  }
  return parsed;
}

export function shouldStopForIncentiveConfidence(analysis: IncentiveAnalysis | null | undefined): boolean {
  if (!analysis) return true;
  return analysis.confidence < INCENTIVE_CONFIDENCE_MIN;
}

type RawAffectRow = Record<string, unknown>;

export async function step3_causalPropagation(
  detectedEvent: DetectedEvent,
  incentiveAnalysis: IncentiveAnalysis,
  availableAssets: PipelineAsset[],
  marketData: Record<string, { price: number; change24h: number; volume: number }>,
  llm: PipelineLlmClient,
): Promise<CausalPropagationResult | null> {
  const marketLines = availableAssets
    .slice(0, 40)
    .map((a) => {
      const m = marketData[a.symbol];
      const px = m ? ` price=${m.price} 24h=${m.change24h}%` : "";
      return `- ${a.symbol} (${a.name}${a.asset_class ? `, ${a.asset_class}` : ""})${px}`;
    })
    .join("\n");

  const prompt = [
    "You are DEPTH4's causal propagation engine. Trace effects through the financial system.",
    "",
    `Event: "${detectedEvent.title}"`,
    `Most likely action: ${incentiveAnalysis.most_likely_action}`,
    `Confidence: ${incentiveAnalysis.confidence}%`,
    "",
    "Available assets (every symbol needs an entry):",
    marketLines,
    "",
    "For EACH asset: direction, strength 0-100, priced_in_percent 0-100, time_depth, asset_depth, reasoning.",
    "direction MUST match reasoning: if the asset price falls use down; if it rises use up (never tag up when reasoning says fall/decrease).",
    "On geopolitical de-escalation / ceasefire: safe-haven assets (GC.1, XAUUSD, GLD) typically move DOWN as risk premium fades; oil (CL) often moves DOWN on supply-disruption relief.",
    "mispricing_score = strength - priced_in_percent.",
    "",
    'Output JSON: {"root_asset":{"symbol":"..."},"affected_assets":[{"symbol":"...","direction":"up|down|neutral",',
    '"strength":0-100,"priced_in_percent":0-100,"mispricing_score":0-100,"time_depth":"L1_confirmed|...",',
    '"asset_depth":"root|direct|indirect|speculative","reasoning":"..."}]}',
  ].join("\n");

  const raw = await llm.completeJson(prompt, 2000);
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const rootSymbol = str((o.root_asset as RawAffectRow | undefined)?.symbol ?? o.rootAsset);
  const rows = (o.affected_assets ?? o.affectedAssets) as RawAffectRow[] | undefined;
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const bySymbol = new Map(availableAssets.map((a) => [a.symbol.toUpperCase(), a]));
  const affectedAssets: AffectedAssetPropagation[] = [];

  for (const row of rows) {
    const symbol = str(row.symbol).toUpperCase();
    const asset = bySymbol.get(symbol);
    if (!asset) continue;
    const strength = clamp(Math.round(num(row.strength, 0)), 0, 100);
    const pricedIn = clamp(Math.round(num(row.priced_in_percent ?? row.pricedInPercent, 0)), 0, 100);
    const mispricing = clamp(
      Math.round(num(row.mispricing_score ?? row.mispricingScore, strength - pricedIn)),
      -100,
      100,
    );
    const declared = (str(row.direction) as "up" | "down" | "neutral") || "neutral";
    const reasoning = str(row.reasoning) || "Causal link from macro propagation scan.";
    const direction = reconcileSafeHavenForDeescalation(
      detectedEvent.title,
      detectedEvent.description,
      symbol,
      reasoning,
      reconcileAffectDirection(reasoning, declared),
    );

    affectedAssets.push({
      asset,
      direction,
      strength,
      pricedInPercent: pricedIn,
      mispricingScore: mispricing,
      timeDepth: parseTimeDepth(row.time_depth ?? row.timeDepth, detectedEvent.title),
      assetDepth: parseAssetDepth(row.asset_depth ?? row.assetDepth, strength),
      reasoning,
    });
  }

  if (affectedAssets.length === 0) return null;

  const rootAsset =
    bySymbol.get(rootSymbol.toUpperCase()) ??
    affectedAssets.sort((a, b) => b.mispricingScore - a.mispricingScore)[0]!.asset;

  const highest = selectThesisMispricingTarget(affectedAssets);

  return { rootAsset, affectedAssets, highestMispricing: highest };
}

export async function step4_generateThesis(
  propagation: CausalPropagationResult,
  detectedEvent: DetectedEvent,
  incentiveAnalysis: IncentiveAnalysis,
  llm: PipelineLlmClient,
): Promise<ThesisCandidate | null> {
  const target = propagation.highestMispricing;
  if (!target) return null;

  const prompt = [
    "You are DEPTH4's thesis writer. Write a professional macro thesis from this analysis.",
    "",
    `TARGET ASSET: ${target.asset.symbol}`,
    `DIRECTION: ${target.direction.toUpperCase()} (down = short / price falls, up = long / price rises)`,
    `MISPRICING: ${target.mispricingScore}/100 (${target.strength}% strength - ${target.pricedInPercent}% priced in)`,
    "",
    `Event: ${detectedEvent.title}`,
    `Actor: ${incentiveAnalysis.actor}`,
    `Goal: ${incentiveAnalysis.goal}`,
    `Constraint: ${incentiveAnalysis.constraint}`,
    `Most likely action: ${incentiveAnalysis.most_likely_action}`,
    `Causal reasoning: ${target.reasoning}`,
    "",
    'Output JSON: {"title":"...","statement":"...","conviction":0-100,"time_horizon":"...",',
    '"trade_plan":{"entry_zone":"...","stop":"...","target1":"...","target2":"..."},',
    '"resolution_paths":{"clean":"...","messy":"...","broken":"..."},',
    '"evidence":[{"date":"YYYY-MM-DD","source":"...","excerpt":"..."}]}',
    "",
    "Conviction must NOT be 50. Trade plan needs specific numbers.",
    "Title and statement must match DIRECTION (down → short/fall language, up → rally/rise language).",
  ].join("\n");

  const raw = await llm.completeJson(prompt, 1500);
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const title = str(o.title);
  const statement = str(o.statement);
  if (!title || !statement) return null;

  const direction: "up" | "down" = target.direction === "down" ? "down" : "up";
  const conviction = clamp(Math.round(num(o.conviction, 72)), 1, 99);
  const finalConviction = conviction === 50 ? 68 : conviction;

  let candidate: ThesisCandidate = {
    title,
    statement,
    direction,
    targetAssetSymbol: target.asset.symbol,
    targetAssetName: target.asset.name,
    conviction: finalConviction,
    mispricingScore: target.mispricingScore,
    timeHorizon: str(o.time_horizon ?? o.timeHorizon) || "This quarter",
    tradePlan:
      parseTradePlanFromLlm(o) ?? {
        entryZone: "—",
        stop: "—",
        target1: "—",
        target2: "—",
      },
    resolutionPaths:
      parseResolutionFromLlm(o) ?? {
        clean: "Catalyst confirms path; price reaches target 1.",
        messy: "Direction holds with noisy headlines; trim into strength.",
        broken: "Invalidation headline or stop level breached.",
      },
    evidence: parseEvidenceFromLlm(o),
  };

  if (candidateNeedsDetailEnrichment(candidate)) {
    const details = await step4b_generateThesisDetails(candidate, detectedEvent, llm);
    if (details) {
      candidate = mergeThesisCandidateDetails(candidate, details);
    }
  }

  if (candidate.evidence.length < 3) {
    const fromHeadlines = detectedEvent.sourceHeadlines
      .map((headline) => ({
        date: detectedEvent.firstDetected.slice(0, 10),
        source: "pipeline",
        excerpt: headline,
      }))
      .filter((e) => e.excerpt.length > 0);
    const merged = [...candidate.evidence];
    for (const item of fromHeadlines) {
      if (merged.length >= 3) break;
      if (!merged.some((m) => m.excerpt === item.excerpt)) merged.push(item);
    }
    candidate = { ...candidate, evidence: merged.slice(0, 6) };
  }

  return candidate;
}
