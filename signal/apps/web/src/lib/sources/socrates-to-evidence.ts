import type { SocratesData } from "@/lib/sources/socrates-scraper";

/** Display + DB source label — proprietary Armstrong Socrates technical data, not a wire headline. */
export const SOCRATES_SOURCE_LABEL = "Armstrong Socrates";

export type SocratesEvidenceHorizon = "D2" | "D3" | "D4";

export interface SocratesEvidencePayload {
  source: "socrates";
  headline: string;
  url: string;
  summary: string;
  assetSymbols: string[];
  direction: "bullish" | "bearish" | "neutral";
  confidence: number;
  horizon: SocratesEvidenceHorizon;
  metadata: {
    scrapedAt: string;
    goldArrays: SocratesData["goldArrays"];
    usdArrays: SocratesData["usdArrays"];
    ecmDates: SocratesData["ecmTurnDates"];
    capitalFlows?: SocratesData["capitalFlows"];
    majorReversals?: SocratesData["majorReversals"];
  };
}

export function parseSocratesDirection(dir: string): "bullish" | "bearish" | "neutral" {
  const d = dir.toLowerCase();
  if (d.includes("bull") || d.includes("up") || d.includes("buy")) return "bullish";
  if (d.includes("bear") || d.includes("down") || d.includes("sell")) return "bearish";
  return "neutral";
}

export function parseSocratesConfidence(conf: string): number {
  const c = conf.toLowerCase();
  if (c.includes("high") || c.includes("strong")) return 0.75;
  if (c.includes("medium") || c.includes("mod")) return 0.55;
  if (c.includes("low") || c.includes("weak")) return 0.35;
  return 0.5;
}

function sharedMetadata(data: SocratesData): SocratesEvidencePayload["metadata"] {
  return {
    scrapedAt: data.scrapedAt,
    goldArrays: data.goldArrays,
    usdArrays: data.usdArrays,
    ecmDates: data.ecmTurnDates,
    capitalFlows: data.capitalFlows,
    majorReversals: data.majorReversals,
  };
}

/**
 * Format Armstrong Socrates snapshots into DEPTH4 evidence payloads for `news_events` ingest.
 * These are technical timing/array signals — not headline rewrites.
 */
export function socratesToEvidence(data: SocratesData): SocratesEvidencePayload[] {
  const evidence: SocratesEvidencePayload[] = [];
  const dateStr = new Date(data.scrapedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const meta = sharedMetadata(data);

  const goldDir = parseSocratesDirection(data.goldArrays.direction);
  evidence.push({
    source: "socrates",
    headline: `Socrates Gold Array: ${data.goldArrays.level} — ${data.goldArrays.direction} (${dateStr})`,
    url: "https://www.armstrongeconomics.com/socrates/arrays/",
    summary: `Armstrong Socrates gold array: ${data.goldArrays.direction} posture at ${data.goldArrays.level}. Confidence ${data.goldArrays.confidence}. Reversal levels: ${data.goldArrays.reversalPoints.join(", ") || "N/A"}.`,
    assetSymbols: ["GC", "XAUUSD"],
    direction: goldDir,
    confidence: parseSocratesConfidence(data.goldArrays.confidence),
    horizon: "D2",
    metadata: meta,
  });

  const usdDir = parseSocratesDirection(data.usdArrays.direction);
  evidence.push({
    source: "socrates",
    headline: `Socrates USD Array: ${data.usdArrays.level} — ${data.usdArrays.direction} (${dateStr})`,
    url: "https://www.armstrongeconomics.com/socrates/arrays/",
    summary: `Armstrong Socrates dollar array: ${data.usdArrays.direction} posture at ${data.usdArrays.level}. Confidence ${data.usdArrays.confidence}.`,
    assetSymbols: ["DXY", "EURUSD"],
    direction: usdDir === "bullish" ? "bearish" : usdDir === "bearish" ? "bullish" : "neutral",
    confidence: parseSocratesConfidence(data.usdArrays.confidence),
    horizon: "D2",
    metadata: meta,
  });

  for (const ecm of data.ecmTurnDates.slice(0, 3)) {
    evidence.push({
      source: "socrates",
      headline: `ECM Turn Date: ${ecm.date}`,
      url: "https://www.armstrongeconomics.com/socrates/ecm/",
      summary: `Armstrong Economic Confidence Model turn window around ${ecm.date}. Long-cycle macro timing — may affect multiple asset classes.`,
      assetSymbols: ["SPX", "GC", "DXY", "CL"],
      direction: ecm.direction,
      confidence: 0.55,
      horizon: "D3",
      metadata: meta,
    });
  }

  return evidence;
}

/** Map evidence payload → `news_events` insert row (dedupe via unique `source_url`). */
export function socratesEvidenceToNewsEventRow(item: SocratesEvidencePayload): {
  headline: string;
  body_text: string;
  source: string;
  source_url: string;
  published_at: string;
  signal_level: number;
  category: string;
  affected_tickers: string[];
  raw_json: Record<string, unknown>;
} {
  const day = item.metadata.scrapedAt.slice(0, 10);
  const slug = item.headline
    .slice(0, 96)
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

  return {
    headline: item.headline,
    body_text: item.summary,
    source: SOCRATES_SOURCE_LABEL,
    source_url: `${item.url}#${day}#${slug}`.slice(0, 2000),
    published_at: item.metadata.scrapedAt,
    signal_level: item.confidence >= 0.7 ? 3 : 2,
    category: "socrates_technical",
    affected_tickers: item.assetSymbols,
    raw_json: {
      ingest: "socrates",
      proprietary_technical: true,
      direction: item.direction,
      confidence: item.confidence,
      horizon: item.horizon,
      metadata: item.metadata,
    },
  };
}
