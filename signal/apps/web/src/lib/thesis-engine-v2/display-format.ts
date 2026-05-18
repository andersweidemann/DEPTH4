import type { ThesisEvidence } from "@/lib/thesis-engine-v2/types";

const DISPLAY_LOCALE = "en-US";

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
  return SOURCE_LABELS[key] ?? humanizeToken(key);
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
