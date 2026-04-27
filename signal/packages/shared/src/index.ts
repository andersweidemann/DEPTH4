import { z } from "zod";

export const TierSchema = z.enum(["free", "pro", "institutional"]);
export type Tier = z.infer<typeof TierSchema>;

export const SignalLevelSchema = z.number().int().min(1).max(4);
export type SignalLevel = z.infer<typeof SignalLevelSchema>;

export const UserRowSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email().nullable(),
  full_name: z.string().nullable(),
  tier: TierSchema,
  timezone: z.string(),
  notification_preferences: z.record(z.unknown()).optional(),
  onboarding_complete: z.boolean().optional(),
});

export type UserRow = z.infer<typeof UserRowSchema>;

export const NewsEventRowSchema = z.object({
  id: z.string().uuid(),
  headline: z.string(),
  body_text: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  source_url: z.string().nullable().optional(),
  published_at: z.string().nullable().optional(),
  signal_level: z.number().int().min(1).max(4),
  category: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  urgency: z.string().nullable().optional(),
  affected_sectors: z.array(z.string()),
  affected_tickers: z.array(z.string()),
  one_line_summary: z.string().nullable().optional(),
  reasoning: z.string().nullable().optional(),
});

export type NewsEventRow = z.infer<typeof NewsEventRowSchema>;

export const ClassificationJsonSchema = z.object({
  signal_level: z.number().int().min(1).max(4),
  category: z.string(),
  region: z.string(),
  urgency: z.string(),
  affected_sectors: z.array(z.string()),
  affected_tickers: z.array(z.string()),
  one_line_summary: z.string(),
  reasoning: z.string(),
});

export type ClassificationJson = z.infer<typeof ClassificationJsonSchema>;

const portfolioImpactZ = z.object({
  summary: z.string().optional(),
  affected_positions: z.array(z.string()).optional(),
  estimated_impact_sek: z.string().optional(),
});

const orderRecZ = z.object({
  ticker: z.string(),
  action: z.string(),
  reason: z.string().optional(),
});

const scenarioZ = z.object({
  label: z.string(),
  probability: z.number(),
  outcome: z.string().optional(),
  market_impact: z.record(z.string()).optional(),
  winners: z.array(z.object({ ticker: z.string(), reason: z.string() })).optional(),
  losers: z.array(z.object({ ticker: z.string(), reason: z.string() })).optional(),
  portfolio_impact: portfolioImpactZ.optional(),
  order_recommendations: z.array(orderRecZ).optional(),
});

export const ConsequenceTreeJsonSchema = z.object({
  event_summary: z.string().optional(),
  signal_level: z.number().int().min(1).max(4).optional(),
  scenarios: z.array(scenarioZ),
  watch_signals: z.array(z.string()).optional(),
});

export type ConsequenceTreeJson = z.infer<typeof ConsequenceTreeJsonSchema>;

export const BROKER_IMPORT_LABELS = ["avanza", "nordnet", "unknown"] as const;
export type BrokerImportSource = (typeof BROKER_IMPORT_LABELS)[number];

export function detectBrokerFromCsvHeader(header: string): BrokerImportSource {
  const h = header.toLowerCase();
  if (h.includes("konto") && h.includes("värdepapper")) return "avanza";
  if (h.includes("depå") && h.includes("ticker")) return "nordnet";
  if (h.includes("avanza")) return "avanza";
  if (h.includes("nordnet")) return "nordnet";
  return "unknown";
}

/** @alias detectBrokerFromCsvHeader */
export const detectBrokerFromCsv = detectBrokerFromCsvHeader;

export interface ParsedCsvPosition {
  ticker: string;
  companyName?: string;
  quantity: number;
  currency: string;
  broker?: string;
}

/** Minimal Avanza positions export: columns vary; match common names */
export function parseAvanzaPositionsCSV(csv: string): ParsedCsvPosition[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(";").map((s) => s.trim().replace(/^\uFEFF/, ""));
  const iName = headers.findIndex((c) => /värdepapper|namn/i.test(c));
  const iIsin = headers.findIndex((c) => /isin|symbol/i.test(c));
  const iAntal = headers.findIndex((c) => /antal/i.test(c));
  const out: ParsedCsvPosition[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cols = lines[r].split(";");
    if (cols.length < 2) continue;
    const name = iName >= 0 ? cols[iName] : cols[0];
    const isin = iIsin >= 0 ? cols[iIsin] : undefined;
    const qRaw = iAntal >= 0 ? cols[iAntal] : "0";
    const qty = parseFloat(String(qRaw).replace(",", ".")) || 0;
    if (qty === 0) continue;
    const t = isin && isin.length >= 2 ? isin : name.replace(/[^A-Z0-9.]/gi, "");
    if (!t) continue;
    out.push({
      ticker: t,
      companyName: name,
      quantity: qty,
      currency: "SEK",
      broker: "Avanza",
    });
  }
  return out;
}

export function parseNordnetPositionsCSV(csv: string): ParsedCsvPosition[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(";").map((s) => s.trim().replace(/^\uFEFF/, ""));
  const iTick = headers.findIndex((c) => /ticker|isin/i.test(c));
  const iName = headers.findIndex((c) => /värde|name/i.test(c));
  const iSt = headers.findIndex((c) => /antal|st\w+/i.test(c));
  const out: ParsedCsvPosition[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cols = lines[r].split(";");
    if (cols.length < 2) continue;
    const ticker = iTick >= 0 ? cols[iTick] : cols[0];
    const name = iName >= 0 ? cols[iName] : "";
    const qty = parseFloat(String(cols[iSt] ?? "0").replace(/\s/g, "").replace(",", ".")) || 0;
    if (qty === 0) continue;
    out.push({
      ticker: String(ticker).toUpperCase(),
      companyName: name,
      quantity: qty,
      currency: "SEK",
      broker: "Nordnet",
    });
  }
  return out;
}

export function parseBrokerCsv(
  contents: string,
  broker: BrokerImportSource
): ParsedCsvPosition[] {
  if (broker === "avanza") return parseAvanzaPositionsCSV(contents);
  if (broker === "nordnet") return parseNordnetPositionsCSV(contents);
  return parseAvanzaPositionsCSV(contents).length
    ? parseAvanzaPositionsCSV(contents)
    : parseNordnetPositionsCSV(contents);
}
