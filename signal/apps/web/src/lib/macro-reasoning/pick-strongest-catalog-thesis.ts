import type { CatalogThesisPass } from "@/lib/macro-reasoning/schema";

const REL_SCORE: Record<string, number> = {
  strong: 4,
  moderate: 3,
  weak: 2,
  none: 0,
};

/**
 * When the model leaves `affected_theses` empty, pick the best catalog line from `per_catalog_thesis`
 * so feed + evidence attachment still have a primary id (seeded_system column updates remain guarded elsewhere).
 */
export function pickStrongestCatalogThesisId(
  passes: CatalogThesisPass[] | undefined,
  curatedOrder: readonly string[],
): string | null {
  if (!passes?.length) return null;
  let best: { id: string; score: number; orderIdx: number } | null = null;
  for (const p of passes) {
    const score = REL_SCORE[p.relevance] ?? 0;
    if (score <= 0) continue;
    const orderIdx = curatedOrder.indexOf(p.thesis_id);
    const tie = orderIdx >= 0 ? orderIdx : 999;
    if (!best || score > best.score || (score === best.score && tie < best.orderIdx)) {
      best = { id: p.thesis_id, score, orderIdx: tie };
    }
  }
  return best?.id ?? null;
}
