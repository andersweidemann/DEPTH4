/** Parse headline + source from evidence log row (matches pipeline insert path). */
export function parseHeadlineAndSourceFromEvidence(
  description: string,
  metadata?: Record<string, unknown> | null,
): { headline: string; source: string } {
  const meta = metadata ?? {};
  const source =
    (typeof meta.source === "string" && meta.source.trim()) ||
    description.match(/^\[([^\]]+)\]/)?.[1] ||
    "DEPTH4";
  const headline = description.replace(/^\[[^\]]+\]\s*/, "").trim() || description;
  return { headline, source };
}
