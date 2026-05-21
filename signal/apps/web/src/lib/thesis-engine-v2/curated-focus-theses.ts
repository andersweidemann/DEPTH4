import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { SYSTEM_THESIS_IDS } from "@/lib/thesis-engine-v2/system-thesis-ids";

/**
 * Default “Focus” strip: how many ready/active rows to show before “See more”.
 */
export const FOCUS_INITIAL_VISIBLE_PREFERRED = 20;

/** Show all ready/active rows when total is at most this many; otherwise use {@link FOCUS_INITIAL_VISIBLE_PREFERRED}. */
export const FOCUS_INITIAL_VISIBLE_MAX = 20;

/**
 * Explicit catalog order for the Focus strip — macro breadth, not array order.
 *
 * 1. QQQ — AI capex / mega-cap margins
 * 2. Gold — geopolitical / peace–war lens
 * 3. TLT — rates / delayed Fed cuts
 * 4. OPEC / shale — energy supply floor
 * 5. Defense — RTX / Pentagon awards
 * 6. Copper — China impulse
 * 7. META / EU platform — regulation (optional depth)
 * 8. Hormuz — chokepoint jump risk (optional tail)
 *
 * User-added theses (not in this list) sort after, using `tieBreak`.
 */
export const CURATED_FOCUS_CATALOG_ORDER: readonly string[] = [
  SYSTEM_THESIS_IDS.qqq,
  SYSTEM_THESIS_IDS.gold,
  SYSTEM_THESIS_IDS.tlt,
  SYSTEM_THESIS_IDS.opec,
  SYSTEM_THESIS_IDS.defense,
  SYSTEM_THESIS_IDS.copper,
  SYSTEM_THESIS_IDS.euTech,
  SYSTEM_THESIS_IDS.hormuz,
] as const;

const ORDER_INDEX = new Map<string, number>(CURATED_FOCUS_CATALOG_ORDER.map((id, i) => [id, i]));

/**
 * Ready / Active theses for the Focus strip: catalog rows follow {@link CURATED_FOCUS_CATALOG_ORDER};
 * any other thesis (e.g. user-authored) follows, ordered by `tieBreak`.
 */
export function orderFocusThesesCuratedThen(
  focus: Thesis[],
  tieBreak: (a: Thesis, b: Thesis) => number,
): Thesis[] {
  const byId = new Map(focus.map((t) => [t.id, t] as const));
  const out: Thesis[] = [];
  const used = new Set<string>();
  for (const id of CURATED_FOCUS_CATALOG_ORDER) {
    const t = byId.get(id);
    if (t) {
      out.push(t);
      used.add(id);
    }
  }
  const rest = focus.filter((t) => !used.has(t.id));
  rest.sort(tieBreak);
  return [...out, ...rest];
}

/**
 * Rows before “See more”: if there are at most {@link FOCUS_INITIAL_VISIBLE_MAX} ready/active theses,
 * show all (full macro map without an extra click). If there are more, show {@link FOCUS_INITIAL_VISIBLE_PREFERRED}
 * first to avoid overload.
 */
export function focusInitialVisibleCount(total: number): number {
  if (total <= 0) return 0;
  if (total <= FOCUS_INITIAL_VISIBLE_MAX) return total;
  return FOCUS_INITIAL_VISIBLE_PREFERRED;
}

/** For diagnostics / tests: position in curated map (larger = later). */
export function curatedFocusOrderIndex(thesisId: string): number {
  return ORDER_INDEX.get(thesisId) ?? CURATED_FOCUS_CATALOG_ORDER.length;
}
