import type { EvidenceLogRowLike, ThesisEvidenceFromLogOpts } from "@/lib/thesis-engine-v2/evidence-log-to-thesis-evidence";
import { thesisEvidenceFromLogRow } from "@/lib/thesis-engine-v2/evidence-log-to-thesis-evidence";
import type { ThesisEvidence } from "@/lib/thesis-engine-v2/types";
import { formatEvidenceSource } from "@/lib/thesis-engine-v2/display-format";
import { normalizeSourceLabel } from "@/lib/news/known-feed-sources";

export type BodyEvidenceInput = {
  date?: string;
  source?: string;
  excerpt?: string;
  headline?: string;
  impact?: string;
  url?: string;
};

export type TimelineEvidenceItem = {
  id: string;
  date: string;
  source: string;
  headline: string;
  excerpt: string;
  impact: ThesisEvidence["impact"];
  url?: string;
  fromBody: boolean;
  dedupeSource: string;
};

/** Normalize `public.theses.body` — object or JSON string from Supabase. */
export function parseThesisBodyJson(body: unknown): Record<string, unknown> | null {
  if (!body) return null;
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
    return null;
  }
  if (typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  return null;
}

export function readBodyEvidenceArray(body: unknown): BodyEvidenceInput[] {
  const o = parseThesisBodyJson(body);
  if (!o) return [];
  const ev = o.evidence;
  if (!Array.isArray(ev)) return [];
  const out: BodyEvidenceInput[] = [];
  for (const raw of ev) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const row = raw as Record<string, unknown>;
    const excerpt = typeof row.excerpt === "string" ? row.excerpt.trim() : "";
    const headline = typeof row.headline === "string" ? row.headline.trim() : "";
    if (!excerpt && !headline) continue;
    out.push({
      date: typeof row.date === "string" ? row.date.trim() : undefined,
      source: typeof row.source === "string" ? row.source.trim() : undefined,
      excerpt: excerpt || headline,
      headline: headline || undefined,
      impact: typeof row.impact === "string" ? row.impact.trim() : undefined,
      url: typeof row.url === "string" ? row.url.trim() : undefined,
    });
  }
  return out;
}

function mapBodyImpactLabel(impact: unknown): ThesisEvidence["impact"] {
  const s = String(impact ?? "supporting").toLowerCase();
  if (s === "contradicting" || s === "negative" || s === "minor_negative" || s === "major_negative") {
    return "minor_negative";
  }
  if (s === "neutral") return "neutral";
  if (s === "major_positive") return "major_positive";
  if (s === "minor_positive" || s === "supporting" || s === "positive") return "minor_positive";
  return "minor_positive";
}

function dateKeyFromIsoOrDate(raw: string | undefined | null): string {
  const s = (raw ?? "").trim();
  if (!s) return "unknown";
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m?.[1]) return m[1];
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  return "unknown";
}

function truncateHeadline(text: string, max = 80): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 3)}...`;
}

function bodyRowToTimelineItem(row: BodyEvidenceInput, thesisId: string, index: number): TimelineEvidenceItem | null {
  const excerpt = (row.excerpt ?? row.headline ?? "").trim();
  if (!excerpt) return null;
  const date = row.date?.trim() || "unknown";
  const source = formatEvidenceSource(row.source || "Source");
  return {
    id: `body-${thesisId}-${date}-${index}`,
    date,
    source,
    headline: truncateHeadline(row.headline?.trim() || excerpt),
    excerpt,
    impact: mapBodyImpactLabel(row.impact),
    url: row.url,
    fromBody: true,
    dedupeSource: row.source?.trim() || source,
  };
}

function timelineItemToThesisEvidence(item: TimelineEvidenceItem, thesisId: string): ThesisEvidence {
  const interpretation =
    item.fromBody && item.excerpt
      ? item.excerpt
      : item.excerpt && item.excerpt !== item.headline
        ? item.excerpt
        : "";
  return {
    id: item.id,
    thesisId,
    source: item.source,
    timestamp: item.date,
    headline: item.headline,
    impact: item.impact,
    probabilityBefore: 0,
    probabilityAfter: 0,
    interpretation,
  };
}

function logRowToTimelineItem(
  row: Record<string, unknown>,
  thesisId: string,
  headlineProbabilityFallback: number,
  opts?: ThesisEvidenceFromLogOpts,
): TimelineEvidenceItem | null {
  const id = String(row.id ?? row.created_at ?? "").trim();
  if (!id) return null;
  const createdAt = row.created_at ? Date.parse(String(row.created_at)) : Number.NaN;
  const logLike: EvidenceLogRowLike = {
    id,
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    thesisId,
    eventType: String(row.event_type ?? row.eventType ?? "EVIDENCE"),
    description: String(row.description ?? row.headline ?? row.excerpt ?? "").trim(),
    probabilityBefore: (row.probability_before ?? row.probabilityBefore) as EvidenceLogRowLike["probabilityBefore"],
    probabilityAfter: (row.probability_after ?? row.probabilityAfter) as EvidenceLogRowLike["probabilityAfter"],
    metadata: row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : undefined,
  };
  const ev = thesisEvidenceFromLogRow(logLike, headlineProbabilityFallback, opts);
  const date =
    typeof row.date === "string" && row.date.trim()
      ? row.date.trim()
      : dateKeyFromIsoOrDate(String(row.created_at ?? ""));
  return {
    id: `log-${id}`,
    date,
    source: ev.source,
    headline: ev.headline,
    excerpt: ev.interpretation || ev.headline,
    impact: ev.impact,
    fromBody: false,
    dedupeSource: String(row.source ?? "").trim() || ev.source,
  };
}

function dedupeKey(item: Pick<TimelineEvidenceItem, "dedupeSource" | "date">): string {
  return `${normalizeSourceLabel(item.dedupeSource)}|${item.date.trim().toLowerCase()}`;
}

function sortTimelineDesc(items: TimelineEvidenceItem[]): TimelineEvidenceItem[] {
  return [...items].sort((a, b) => {
    if (a.date === "unknown") return 1;
    if (b.date === "unknown") return -1;
    const ta = Date.parse(a.date);
    const tb = Date.parse(b.date);
    if (!Number.isNaN(ta) && !Number.isNaN(tb)) return tb - ta;
    return b.date.localeCompare(a.date);
  });
}

/**
 * Merge `body.evidence[]` (pipeline) with `thesis_evidence_log` rows and optional bundle rows.
 * Deduplicates by source + date; body rows win over log rows.
 */
export function mergeEvidenceSources(
  bodyEvidence: BodyEvidenceInput[] | null | undefined,
  logEvidence: Record<string, unknown>[] | null | undefined,
  thesisId: string,
  opts?: {
    bundleEvidence?: ThesisEvidence[];
    headlineProbabilityFallback?: number;
    logOpts?: ThesisEvidenceFromLogOpts;
  },
): ThesisEvidence[] {
  const items: TimelineEvidenceItem[] = [];
  const p = opts?.headlineProbabilityFallback ?? 50;

  if (bodyEvidence?.length) {
    bodyEvidence.forEach((row, index) => {
      const mapped = bodyRowToTimelineItem(row, thesisId, index);
      if (mapped) items.push(mapped);
    });
  }

  if (logEvidence?.length) {
    for (const row of logEvidence) {
      const mapped = logRowToTimelineItem(row, thesisId, p, opts?.logOpts);
      if (mapped) items.push(mapped);
    }
  }

  const seen = new Set<string>();
  const deduped: TimelineEvidenceItem[] = [];
  const sorted = [...items].sort((a, b) => (a.fromBody === b.fromBody ? 0 : a.fromBody ? -1 : 1));
  for (const item of sorted) {
    const key = dedupeKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  const timeline = sortTimelineDesc(deduped);
  const merged = timeline.map((t) => timelineItemToThesisEvidence(t, thesisId));

  const bundle = opts?.bundleEvidence ?? [];
  if (!bundle.length) return merged;

  const liveKeys = new Set(
    merged.map((e) => `${e.source.trim().toLowerCase()}|${e.timestamp.trim().toLowerCase()}`),
  );
  const extras = bundle.filter((e) => {
    const key = `${e.source.trim().toLowerCase()}|${e.timestamp.trim().toLowerCase()}`;
    return !liveKeys.has(key);
  });
  return [...merged, ...extras];
}

/** Convenience: read body JSON and merge with log rows for timeline UI. */
export function mergeEvidenceTimelineFromBodyAndLog(
  body: unknown,
  logRows: EvidenceLogRowLike[],
  thesisId: string,
  headlineProbabilityFallback: number,
  opts?: ThesisEvidenceFromLogOpts & { bundleEvidence?: ThesisEvidence[] },
): ThesisEvidence[] {
  const logRaw = logRows.map((r) => ({
    id: r.id,
    created_at: new Date(r.createdAt).toISOString(),
    event_type: r.eventType,
    description: r.description,
    probability_before: r.probabilityBefore,
    probability_after: r.probabilityAfter,
    metadata: r.metadata,
  }));
  return mergeEvidenceSources(readBodyEvidenceArray(body), logRaw, thesisId, {
    bundleEvidence: opts?.bundleEvidence,
    headlineProbabilityFallback,
    logOpts: opts,
  });
}
