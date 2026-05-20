import type { ThesisEvidence } from "@/lib/thesis-engine-v2/types";
import { formatEvidenceSource } from "@/lib/thesis-engine-v2/display-format";

export type BodyEvidenceRow = {
  date?: string;
  source?: string;
  excerpt?: string;
  headline?: string;
};

function parseBodyEvidenceRow(raw: unknown): BodyEvidenceRow | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const excerpt = typeof o.excerpt === "string" ? o.excerpt.trim() : "";
  const headline = typeof o.headline === "string" ? o.headline.trim() : "";
  const source = typeof o.source === "string" ? o.source.trim() : "";
  const date = typeof o.date === "string" ? o.date.trim() : "";
  if (!excerpt && !headline) return null;
  return { date, source, excerpt, headline };
}

/** Map `public.theses.body.evidence[]` (pipeline) into timeline rows. */
export function thesisEvidenceFromBodyJson(body: unknown, thesisId: string): ThesisEvidence[] {
  if (!body || typeof body !== "object" || Array.isArray(body)) return [];
  const ev = (body as Record<string, unknown>).evidence;
  if (!Array.isArray(ev)) return [];

  const items: ThesisEvidence[] = [];
  ev.forEach((raw, index) => {
    const row = parseBodyEvidenceRow(raw);
    if (!row) return;
    const headline = (row.headline || row.excerpt || "").trim();
    if (!headline) return;
    const source = formatEvidenceSource(row.source || "Source");
    const timestamp = row.date?.trim() || "—";
    items.push({
      id: `body-ev-${thesisId}-${index}`,
      thesisId,
      source,
      timestamp,
      headline: headline.length > 480 ? `${headline.slice(0, 477)}…` : headline,
      impact: "neutral",
      probabilityBefore: 0,
      probabilityAfter: 0,
      interpretation: row.excerpt && row.excerpt !== headline ? row.excerpt.trim() : "",
    });
  });

  return items.sort((a, b) => {
    const ta = Date.parse(a.timestamp);
    const tb = Date.parse(b.timestamp);
    if (!Number.isNaN(ta) && !Number.isNaN(tb)) return tb - ta;
    return 0;
  });
}
