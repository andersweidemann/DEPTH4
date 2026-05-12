import { getThesisDetail } from "@/lib/thesis-engine-v2/catalog-data";
import {
  applyDbScenarioTripleToThesisWithBundleScenarios,
} from "@/lib/thesis-engine-v2/thesis-display-scenarios";
import {
  displayConvictionPctFromListItem,
  getThesisDisplayModel,
} from "@/lib/thesis-engine-v2/thesis-display-selectors";
import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { loadUserTheses } from "@/lib/thesis-engine-v2/user-theses";
import type { ThesisListItem } from "@/types/thesis";

/**
 * Rebuild the server-list baseline `Thesis` so `mergeThesis` matches the detail page’s pre-live bundle thesis
 * (catalog: static row + DB `scenario_probabilities`; user: hydrated `loadUserTheses()` when present).
 *
 * **Cache boundary:** `GET /api/theses` supplies `conviction` + `listBaselineScenarioTriple` from Postgres at
 * fetch time; SWR may serve a stale JSON body, but conviction **digits** on `/theses` are recomputed here on
 * every render from `ThesisLiveProvider` overrides (Supabase evidence poll), so they track the detail route.
 */
export function resolveListRowBaselineThesis(item: ThesisListItem): Thesis | null {
  const fromUser = loadUserTheses().find((t) => t.id === item.thesisId);
  if (fromUser) return fromUser;

  const detail = getThesisDetail(item.slug);
  if (!detail) return null;

  const triple = item.listBaselineScenarioTriple;
  if (triple) {
    return applyDbScenarioTripleToThesisWithBundleScenarios(detail.thesis, detail.scenarios, triple);
  }
  return detail.thesis;
}

/** List conviction that tracks `ThesisLiveProvider.mergeThesis` (same as `/theses/[slug]` detail shell). */
export function displayConvictionPctFromThesesListItemWithLive(
  item: ThesisListItem,
  mergeThesis: (t: Thesis) => Thesis,
): number {
  const base = resolveListRowBaselineThesis(item);
  if (!base) return displayConvictionPctFromListItem(item);
  const merged = mergeThesis(base);
  return Math.round(getThesisDisplayModel(merged).convictionPct);
}

export function convictionIsTemplateEstimateForThesesListItemWithLive(
  item: ThesisListItem,
  mergeThesis: (t: Thesis) => Thesis,
): boolean {
  const base = resolveListRowBaselineThesis(item);
  if (!base) return item.convictionIsTemplateEstimate;
  const merged = mergeThesis(base);
  return getThesisDisplayModel(merged).convictionIsTemplateEstimate;
}
