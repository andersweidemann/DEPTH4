import type { ThesisCandidate } from "@/lib/ai/thesis-pipeline-types";
import type { ThesisCluster } from "@/types/causal-graph";

/** Candidate + event context for semantic dedup before save. */
export type ThesisSimilarityInput = Pick<
  ThesisCandidate,
  "title" | "statement" | "targetAssetSymbol" | "direction"
> & {
  eventTitle: string;
};

/** Existing thesis row used for comparison (from causal graph clusters). */
export type ExistingThesisForSimilarity = ThesisSimilarityInput & {
  id: string;
  slug: string;
};

export function normalizeAssetSymbol(symbol: string): string {
  const s = symbol.trim().toUpperCase();
  if (s === "CL" || s === "WTI" || s === "USOIL" || s === "BRENT" || s === "BZ") return "CL.1";
  if (s === "GC" || s === "GOLD" || s === "XAUUSD") return "GC.1";
  return s;
}

function significantWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3),
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  a.forEach((w) => {
    if (b.has(w)) intersection += 1;
  });
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function calculateTitleSimilarity(a: string, b: string): number {
  return jaccardSimilarity(significantWords(a), significantWords(b));
}

export function calculateStatementSimilarity(a: string, b: string): number {
  return jaccardSimilarity(significantWords(a), significantWords(b));
}

function normalizeEventKey(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function eventMatchScore(a: string, b: string): number {
  const na = normalizeEventKey(a);
  const nb = normalizeEventKey(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const short = 12;
  if (na.includes(nb.slice(0, short)) || nb.includes(na.slice(0, short))) return 1;
  return jaccardSimilarity(significantWords(na), significantWords(nb)) >= 0.35 ? 1 : 0;
}

export function similarityScore(
  candidate: ThesisSimilarityInput,
  existing: ThesisSimilarityInput,
): number {
  const assetMatch =
    normalizeAssetSymbol(candidate.targetAssetSymbol) ===
    normalizeAssetSymbol(existing.targetAssetSymbol)
      ? 1
      : 0;
  const directionMatch = candidate.direction === existing.direction ? 1 : 0;
  const eventScore = eventMatchScore(candidate.eventTitle, existing.eventTitle);
  const titleScore = calculateTitleSimilarity(candidate.title, existing.title);
  const statementScore = calculateStatementSimilarity(candidate.statement, existing.statement);

  return (
    assetMatch * 0.3 +
    directionMatch * 0.2 +
    eventScore * 0.2 +
    titleScore * 0.15 +
    statementScore * 0.15
  );
}

export function findSimilarThesis(
  candidate: ThesisSimilarityInput,
  existingTheses: ExistingThesisForSimilarity[],
  threshold = 0.75,
): { thesis: ExistingThesisForSimilarity; score: number } | null {
  let best: { thesis: ExistingThesisForSimilarity; score: number } | null = null;

  for (const existing of existingTheses) {
    const score = similarityScore(candidate, existing);
    if (score >= threshold && (!best || score > best.score)) {
      best = { thesis: existing, score };
    }
  }

  return best;
}

/** Attach cluster event titles so event similarity can run on flat thesis lists. */
export function buildDedupCorpusFromClusters(clusters: ThesisCluster[]): ExistingThesisForSimilarity[] {
  return clusters.flatMap((cluster) =>
    cluster.theses.map((t) => ({
      id: t.id,
      slug: t.slug,
      title: t.title,
      statement: t.statement,
      targetAssetSymbol: t.targetAssetSymbol,
      direction: t.direction,
      eventTitle: cluster.event.title,
    })),
  );
}

export function candidateToSimilarityInput(
  candidate: ThesisCandidate,
  eventTitle: string,
): ThesisSimilarityInput {
  return {
    title: candidate.title,
    statement: candidate.statement,
    targetAssetSymbol: candidate.targetAssetSymbol,
    direction: candidate.direction,
    eventTitle,
  };
}
