import type { ThesisEvidence } from "@/lib/thesis-engine-v2/types";

export const DISPLAY_LOCALE = "en-US";

const INTERNAL_SOURCE_KEYS = new Set([
  "news_events",
  "event_reasoning",
  "thesis_discovery_clusters",
  "thesis_evidence_log",
  "thesis_depth_book",
  "thesis_updates",
]);

/** English-facing timestamps for thesis surfaces (avoids locale-driven CJK month/day glyphs). */
export function formatThesisDisplayTimestamp(ms: number): string {
  return new Date(ms).toLocaleString(DISPLAY_LOCALE, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  NEWS_DEVELOPMENT: "News development",
  NEWS_EVENT: "News event",
  EVIDENCE: "Evidence",
  MANUAL: "Manual update",
  SYSTEM: "System update",
};

const SOURCE_LABELS: Record<string, string> = {
  news_events: "News wire",
  NEWS_DEVELOPMENT: "News development",
  DEPTH4: "DEPTH4",
  depth4: "DEPTH4",
};

function humanizeToken(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (/^[a-z][a-z0-9_]*$/i.test(t) && t.includes("_")) {
    return t
      .split("_")
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }
  return t;
}

export function formatEvidenceEventLabel(eventType: string): string {
  const key = eventType.trim();
  if (!key) return "Development";
  return EVENT_TYPE_LABELS[key] ?? humanizeToken(key);
}

export function formatEvidenceSource(source: string): string {
  const key = source.trim();
  if (!key) return "DEPTH4";
  const mapped = SOURCE_LABELS[key];
  if (mapped) return mapped;
  if (INTERNAL_SOURCE_KEYS.has(key)) return "News wire";
  if (/^[a-z][a-z0-9_]*$/i.test(key) && key.includes("_")) {
    return "News wire";
  }
  return humanizeToken(key);
}

/** en-US date/time for product surfaces (avoids locale-driven CJK glyphs). */
export function formatAppLocaleDateTime(
  value: string | number | Date,
  opts?: Intl.DateTimeFormatOptions,
): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(DISPLAY_LOCALE, opts);
}

export function formatAppLocaleDate(value: string | number | Date): string {
  return formatAppLocaleDateTime(value, { month: "short", day: "numeric", year: "numeric" });
}

/** One-line conviction change for timeline rows; null when redundant or unknown. */
export function evidenceConvictionSummary(ev: ThesisEvidence): string | null {
  if (ev.logScenarioAfterStored === false) {
    return null;
  }
  if (ev.probabilityBefore === ev.probabilityAfter) {
    return `Conviction ${ev.probabilityBefore}% (unchanged)`;
  }
  return `Conviction ${ev.probabilityBefore}% → ${ev.probabilityAfter}%`;
}
