import {
  ASSET_DEPTH_LABELS,
  ASSET_DEPTHS,
  TIME_DEPTH_LABELS,
  TIME_DEPTHS,
} from "@/types/causal-graph";
import type {
  AssetDepth,
  CausalAffect,
  CausalEvent,
  CausalMatrixData,
  CausalThesis,
  MatrixCell,
  ThesisCluster,
  TimeDepth,
} from "@/types/causal-graph";

export function inferTimeDepth(timeHorizon: string): TimeDepth {
  const h = timeHorizon.toLowerCase();
  if (h.includes("day") || h.includes("now") || h.includes("immediate")) return "L1_confirmed";
  if (h.includes("week")) return "L2_this_week";
  if (h.includes("month")) return "L3_this_month";
  return "L4_this_quarter";
}

export function inferAssetDepth(strength: number): AssetDepth {
  if (strength >= 70) return "direct";
  if (strength >= 30) return "indirect";
  return "speculative";
}

function affectToCell(
  affect: CausalAffect,
  overrides: Partial<MatrixCell> = {},
): MatrixCell {
  const why =
    overrides.whyItMatters?.trim() ||
    affect.whyItMatters?.trim() ||
    overrides.thesisTitle ||
    "Market effect from linked thesis";

  return {
    assetId: affect.assetId ?? affect.assetSymbol,
    assetSymbol: affect.assetSymbol,
    assetName: affect.assetName ?? affect.assetSymbol,
    direction: affect.direction,
    strength: affect.strength,
    pricedInPercent: affect.pricedInPercent,
    mispricingScore: affect.mispricingScore,
    hasThesis: affect.hasDedicatedThesis,
    thesisSlug: affect.thesisSlug,
    whyItMatters: why,
    ...overrides,
  };
}

function shouldReplaceCell(existing: MatrixCell | undefined, next: MatrixCell): boolean {
  if (!existing) return true;
  return next.mispricingScore > existing.mispricingScore;
}

function placeCell(
  cells: CausalMatrixData["cells"],
  timeDepth: TimeDepth,
  assetDepth: AssetDepth,
  cell: MatrixCell,
) {
  const row = cells[timeDepth] ?? {};
  if (shouldReplaceCell(row[assetDepth], cell)) {
    row[assetDepth] = cell;
    cells[timeDepth] = row;
  }
}

export function buildMatrixFromCluster(cluster: ThesisCluster): CausalMatrixData {
  const cells: CausalMatrixData["cells"] = {};
  const missingCells: CausalMatrixData["missingCells"] = [];

  for (const td of TIME_DEPTHS) {
    cells[td] = {};
  }

  for (const thesis of cluster.theses) {
    const defaultTimeDepth = inferTimeDepth(thesis.timeHorizon);
    const targetSym = thesis.targetAssetSymbol.toUpperCase();

    const rootAffect =
      thesis.affects.find((a) => a.assetSymbol.toUpperCase() === targetSym) ??
      thesis.affects.reduce<CausalAffect | undefined>(
        (best, a) => (a.strength > (best?.strength ?? -1) ? a : best),
        thesis.affects[0],
      );

    if (rootAffect) {
      const timeDepth = rootAffect.timeDepth ?? defaultTimeDepth;
      placeCell(cells, timeDepth, "root", {
        ...affectToCell(rootAffect, {
          direction: thesis.direction,
          hasThesis: true,
          thesisSlug: thesis.slug,
          thesisTitle: thesis.title,
          conviction: thesis.conviction,
          timeHorizon: thesis.timeHorizon,
          whyItMatters: rootAffect.whyItMatters || thesis.statement || thesis.title,
        }),
      });
    }

    for (const affect of thesis.affects) {
      if (rootAffect && affect.id && affect.id === rootAffect.id) continue;
      if (rootAffect && affect.assetSymbol === rootAffect.assetSymbol && !affect.id) continue;

      const timeDepth = affect.timeDepth ?? defaultTimeDepth;
      const assetDepth =
        affect.assetDepth ??
        (affect.assetSymbol.toUpperCase() === targetSym ? "root" : inferAssetDepth(affect.strength));

      if (assetDepth === "root" && cells[timeDepth]?.root) continue;

      placeCell(
        cells,
        timeDepth,
        assetDepth,
        affectToCell(affect, {
          hasThesis: affect.hasDedicatedThesis || affect.assetSymbol.toUpperCase() === targetSym,
          thesisSlug: affect.thesisSlug ?? (affect.assetSymbol.toUpperCase() === targetSym ? thesis.slug : undefined),
          thesisTitle:
            affect.assetSymbol.toUpperCase() === targetSym ? thesis.title : undefined,
          conviction: affect.assetSymbol.toUpperCase() === targetSym ? thesis.conviction : undefined,
          timeHorizon: thesis.timeHorizon,
          whyItMatters: affect.whyItMatters || (affect.assetSymbol.toUpperCase() === targetSym ? thesis.statement : undefined),
        }),
      );
    }
  }

  for (const implied of cluster.impliedEffects) {
    const timeDepth: TimeDepth = implied.netStrength > 50 ? "L3_this_month" : "L4_this_quarter";
    const assetDepth = inferAssetDepth(implied.netStrength);

    if (!cells[timeDepth]?.[assetDepth]) {
      placeCell(cells, timeDepth, assetDepth, {
        assetId: implied.id,
        assetSymbol: implied.assetSymbol,
        assetName: implied.assetSymbol,
        direction: implied.netDirection,
        strength: implied.netStrength,
        pricedInPercent: implied.pricedInPercent,
        mispricingScore: Math.max(0, implied.netStrength - implied.pricedInPercent),
        hasThesis: implied.hasDedicatedThesis,
        thesisSlug: implied.thesisSlug,
        timeHorizon: TIME_DEPTH_LABELS[timeDepth],
        whyItMatters: implied.whyItMatters || `Implied from ${cluster.event.title}`,
      });
    }
  }

  for (const td of TIME_DEPTHS) {
    for (const ad of ASSET_DEPTHS) {
      if (!cells[td]?.[ad]) {
        missingCells.push({
          timeDepth: td,
          assetDepth: ad,
          note: `No ${ASSET_DEPTH_LABELS[ad]} effect mapped for ${TIME_DEPTH_LABELS[td]}`,
        });
      }
    }
  }

  return {
    event: cluster.event,
    cells,
    missingCells,
    lastUpdated: cluster.event.lastUpdated ?? cluster.event.firstDetected,
  };
}

/** Single-row matrix for one thesis on the detail page. */
export function buildMatrixFromThesis(thesis: CausalThesis, rootEvent: CausalEvent): CausalMatrixData {
  const timeDepth = inferTimeDepth(thesis.timeHorizon);
  const cells: CausalMatrixData["cells"] = {};
  for (const td of TIME_DEPTHS) {
    cells[td] = {};
  }

  const targetSym = thesis.targetAssetSymbol.toUpperCase();
  const sorted = [...thesis.affects].sort((a, b) => b.strength - a.strength);

  for (const affect of sorted) {
    const isTarget = affect.assetSymbol.toUpperCase() === targetSym;
    const assetDepth: AssetDepth =
      affect.assetDepth ?? (isTarget ? "root" : inferAssetDepth(affect.strength));
    const td = affect.timeDepth ?? timeDepth;

    placeCell(
      cells,
      td,
      assetDepth,
      affectToCell(affect, {
        direction: isTarget ? thesis.direction : affect.direction,
        hasThesis: true,
        thesisSlug: thesis.slug,
        thesisTitle: isTarget ? thesis.title : undefined,
        timeHorizon: thesis.timeHorizon,
        whyItMatters: affect.whyItMatters || (isTarget ? thesis.statement : affect.whyItMatters),
      }),
    );
  }

  if (!cells[timeDepth]?.root) {
    placeCell(cells, timeDepth, "root", {
      assetId: targetSym,
      assetSymbol: thesis.targetAssetSymbol,
      assetName: thesis.targetAssetSymbol,
      direction: thesis.direction,
      strength: 85,
      pricedInPercent: Math.max(0, 100 - thesis.mispricingScore),
      mispricingScore: thesis.mispricingScore,
      hasThesis: true,
      thesisSlug: thesis.slug,
      thesisTitle: thesis.title,
      conviction: thesis.conviction,
      timeHorizon: thesis.timeHorizon,
      whyItMatters: thesis.statement || thesis.title,
    });
  }

  const missingCells: CausalMatrixData["missingCells"] = [];
  for (const ad of ASSET_DEPTHS) {
    if (!cells[timeDepth]?.[ad]) {
      missingCells.push({
        timeDepth,
        assetDepth: ad,
        note: `No ${ASSET_DEPTH_LABELS[ad]} effect mapped`,
      });
    }
  }

  return {
    event: rootEvent,
    cells,
    missingCells,
    lastUpdated: rootEvent.lastUpdated ?? rootEvent.firstDetected,
  };
}

/** Row keys that have at least one filled cell (for mini matrix). */
export function activeTimeDepths(matrix: CausalMatrixData): TimeDepth[] {
  return TIME_DEPTHS.filter((td) => ASSET_DEPTHS.some((ad) => matrix.cells[td]?.[ad]));
}
