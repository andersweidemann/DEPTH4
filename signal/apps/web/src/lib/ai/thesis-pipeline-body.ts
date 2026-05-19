import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { thesisToDbBodyPayload } from "@/lib/thesis-engine-v2/thesis-db-body";
import type { ThesisCandidate, TradePlan, ResolutionPaths } from "@/lib/ai/thesis-pipeline-types";

const PLACEHOLDER_LEVEL_RE =
  /^(tbd|—|-|\u2014|pending|awaiting|n\/a|null|undefined)$/i;

export function isPlaceholderTradeLevel(value: string | null | undefined): boolean {
  const t = (value ?? "").trim();
  if (!t) return true;
  if (PLACEHOLDER_LEVEL_RE.test(t)) return true;
  if (/^pending\b/i.test(t) || /^awaiting\b/i.test(t)) return true;
  return false;
}

export function isTradePlanComplete(plan: TradePlan): boolean {
  return (
    !isPlaceholderTradeLevel(plan.entryZone) &&
    !isPlaceholderTradeLevel(plan.stop) &&
    !isPlaceholderTradeLevel(plan.target1)
  );
}

export function isResolutionPathsComplete(paths: ResolutionPaths): boolean {
  return (
    !isPlaceholderTradeLevel(paths.clean) &&
    !isPlaceholderTradeLevel(paths.messy) &&
    !isPlaceholderTradeLevel(paths.broken)
  );
}

export function candidateNeedsDetailEnrichment(candidate: ThesisCandidate): boolean {
  return (
    !isTradePlanComplete(candidate.tradePlan) ||
    candidate.evidence.length < 3 ||
    !isResolutionPathsComplete(candidate.resolutionPaths)
  );
}

export type PipelineBodyTradePlan = {
  entry_zone: string;
  stop: string;
  target1: string;
  target2: string | null;
};

export type PipelineBodyEvidence = {
  date: string;
  source: string;
  excerpt: string;
  url: string | null;
};

export type PipelineBodyResolutionPaths = {
  clean: string;
  messy: string;
  broken: string;
};

export function buildPipelineBodyPayload(
  thesis: Thesis,
  candidate: ThesisCandidate,
  options?: { pricedInPercent?: number | null },
): Record<string, unknown> {
  const targetSymbol =
    candidate.targetAssetSymbol?.trim() || thesis.asset?.split(/[\s—–-]/)[0]?.trim() || "XAUUSD";
  const base = thesisToDbBodyPayload(thesis);
  return {
    ...base,
    tradePlan: {
      entry_zone: candidate.tradePlan.entryZone,
      stop: candidate.tradePlan.stop,
      target1: candidate.tradePlan.target1,
      target2: candidate.tradePlan.target2 || null,
      pricedInEstimate:
        options?.pricedInPercent != null && Number.isFinite(options.pricedInPercent)
          ? options.pricedInPercent
          : null,
    },
    evidence: candidate.evidence.map((e) => ({
      date: e.date,
      source: e.source,
      excerpt: e.excerpt,
      url: "url" in e && typeof (e as { url?: string }).url === "string" ? (e as { url: string }).url : null,
    })),
    resolutionPaths: {
      clean: candidate.resolutionPaths.clean,
      messy: candidate.resolutionPaths.messy,
      broken: candidate.resolutionPaths.broken,
    },
    direction: candidate.direction,
    time_horizon: candidate.timeHorizon,
    conviction: candidate.conviction,
    target_asset: targetSymbol,
    ...(candidate.deepReasoning
      ? {
          deepReasoning: {
            D3: candidate.deepReasoning.D3,
            D4: candidate.deepReasoning.D4,
          },
        }
      : {}),
  };
}

function readTradePlanFromBody(o: Record<string, unknown>): PipelineBodyTradePlan | null {
  const tp = o.tradePlan ?? o.trade_plan;
  if (!tp || typeof tp !== "object" || Array.isArray(tp)) return null;
  const row = tp as Record<string, unknown>;
  const entry_zone = String(row.entry_zone ?? row.entryZone ?? "").trim();
  const stop = String(row.stop ?? "").trim();
  const target1 = String(row.target1 ?? "").trim();
  if (!entry_zone && !stop && !target1) return null;
  return {
    entry_zone,
    stop,
    target1,
    target2: String(row.target2 ?? "").trim() || null,
  };
}

function readResolutionFromBody(o: Record<string, unknown>): PipelineBodyResolutionPaths | null {
  const rp = o.resolutionPaths ?? o.resolution_paths;
  if (!rp || typeof rp !== "object" || Array.isArray(rp)) return null;
  const row = rp as Record<string, unknown>;
  const clean = String(row.clean ?? "").trim();
  const messy = String(row.messy ?? "").trim();
  const broken = String(row.broken ?? "").trim();
  if (!clean && !messy && !broken) return null;
  return { clean, messy, broken };
}

export function readEvidenceFromBody(o: Record<string, unknown>): PipelineBodyEvidence[] {
  const ev = o.evidence;
  if (!Array.isArray(ev)) return [];
  return ev
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const excerpt = String(row.excerpt ?? row.headline ?? "").trim();
      if (!excerpt) return null;
      return {
        date: String(row.date ?? "").trim() || new Date().toISOString().slice(0, 10),
        source: String(row.source ?? "news").trim(),
        excerpt,
        url: row.url != null ? String(row.url) : null,
      };
    })
    .filter((x): x is PipelineBodyEvidence => x !== null);
}

/** Post-save / pre-promote check: detail page requires nested body blocks. */
export function verifyPipelineBodyForRender(body: unknown): { ok: boolean; missing: string[] } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, missing: ["tradePlan", "evidence", "resolutionPaths"] };
  }
  const o = body as Record<string, unknown>;
  const missing: string[] = [];

  const tp = readTradePlanFromBody(o);
  if (
    !tp ||
    isPlaceholderTradeLevel(tp.entry_zone) ||
    isPlaceholderTradeLevel(tp.stop)
  ) {
    missing.push("tradePlan");
  }

  const evidence = readEvidenceFromBody(o);
  if (evidence.length < 1) missing.push("evidence");

  const rp = readResolutionFromBody(o);
  if (!rp || isPlaceholderTradeLevel(rp.clean)) missing.push("resolutionPaths");

  return { ok: missing.length === 0, missing };
}

export function bodyTradePlanForQualityGate(body: unknown): PipelineBodyTradePlan | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  return readTradePlanFromBody(body as Record<string, unknown>);
}

export function bodyEvidenceCount(body: unknown): number {
  if (!body || typeof body !== "object" || Array.isArray(body)) return 0;
  return readEvidenceFromBody(body as Record<string, unknown>).length;
}

export function bodyResolutionPathsForQualityGate(body: unknown): PipelineBodyResolutionPaths | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  return readResolutionFromBody(body as Record<string, unknown>);
}
