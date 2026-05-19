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
    "You are DEPTH4's event detection engine. Read these news items and identify the SINGLE most important causal event.",
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
    'Output JSON: {"incentive_analysis":{"actor":"...","goal":"...","constraint":"...","required_action":"...",',
    '"alternative_actions":["..."],"most_likely_action":"...","confidence":0-100,"time_window":"...",',
    '"catalyst_events":["..."],"reasoning":"..."}}',
    "",
    "If you cannot identify a clear actor/goal/constraint, return confidence: 0.",
  ].join("\n");

  const raw = await llm.completeJson(prompt, 800);
  const parsed = parseIncentiveFromLlm(raw);
  if (!parsed) return null;
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
    affectedAssets.push({
      asset,
      direction: (str(row.direction) as "up" | "down" | "neutral") || "neutral",
      strength,
      pricedInPercent: pricedIn,
      mispricingScore: mispricing,
      timeDepth: parseTimeDepth(row.time_depth ?? row.timeDepth, detectedEvent.title),
      assetDepth: parseAssetDepth(row.asset_depth ?? row.assetDepth, strength),
      reasoning: str(row.reasoning) || "Causal link from macro propagation scan.",
    });
  }

  if (affectedAssets.length === 0) return null;

  const rootAsset =
    bySymbol.get(rootSymbol.toUpperCase()) ??
    affectedAssets.sort((a, b) => b.mispricingScore - a.mispricingScore)[0]!.asset;

  const highest =
    affectedAssets
      .filter((a) => a.mispricingScore >= MISPRICING_SCORE_MIN)
      .sort((a, b) => b.mispricingScore - a.mispricingScore)[0] ?? null;

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
    `DIRECTION: ${target.direction.toUpperCase()}`,
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
  ].join("\n");

  const raw = await llm.completeJson(prompt, 1500);
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const title = str(o.title);
  const statement = str(o.statement);
  if (!title || !statement) return null;

  const direction = str(o.direction).toLowerCase() === "down" || target.direction === "down" ? "down" : "up";
  const conviction = clamp(Math.round(num(o.conviction, 72)), 1, 99);
  const finalConviction = conviction === 50 ? 68 : conviction;

  const tp = (o.trade_plan ?? o.tradePlan) as Record<string, unknown> | undefined;
  const rp = (o.resolution_paths ?? o.resolutionPaths) as Record<string, unknown> | undefined;
  const evidenceRaw = o.evidence;

  const evidence = Array.isArray(evidenceRaw)
    ? evidenceRaw
        .map((e) => {
          if (!e || typeof e !== "object") return null;
          const ex = e as Record<string, unknown>;
          const excerpt = str(ex.excerpt);
          if (!excerpt) return null;
          return {
            date: str(ex.date) || new Date().toISOString().slice(0, 10),
            source: str(ex.source) || "news",
            excerpt,
          };
        })
        .filter((x): x is { date: string; source: string; excerpt: string } => x !== null)
        .slice(0, 6)
    : [];

  return {
    title,
    statement,
    direction,
    targetAssetSymbol: target.asset.symbol,
    targetAssetName: target.asset.name,
    conviction: finalConviction,
    mispricingScore: target.mispricingScore,
    timeHorizon: str(o.time_horizon ?? o.timeHorizon) || "This quarter",
    tradePlan: {
      entryZone: str(tp?.entry_zone ?? tp?.entryZone) || "—",
      stop: str(tp?.stop) || "—",
      target1: str(tp?.target1) || "—",
      target2: str(tp?.target2) || "—",
    },
    resolutionPaths: {
      clean: str(rp?.clean) || "Catalyst confirms path; price reaches target 1.",
      messy: str(rp?.messy) || "Direction holds with noisy headlines; trim into strength.",
      broken: str(rp?.broken) || "Invalidation headline or stop level breached.",
    },
    evidence,
  };
}
