"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  ASSET_DEPTHS,
  ASSET_DEPTH_LABELS,
  TIME_DEPTHS,
  TIME_DEPTH_LABELS,
} from "@/types/causal-graph";
import type { AssetDepth, CausalMatrixData, MatrixCell, TimeDepth } from "@/types/causal-graph";
import { DepthDepthLabel } from "@/components/thesis-engine-v2/DepthDepthLabel";
import { TooltipTerm } from "@/components/thesis-engine-v2/TooltipTerm";
import { MATRIX_ASSET_TOOLTIPS } from "@/lib/depth-labels";
import { MatrixCellDetail } from "@/components/causal-matrix/MatrixCellDetail";

interface CausalMatrixProps {
  matrix: CausalMatrixData;
  detailTreeSlot?: ReactNode;
  variant?: "full" | "compact";
}

export function CausalMatrix({ matrix, detailTreeSlot, variant = "full" }: CausalMatrixProps) {
  const compact = variant === "compact";
  const [selectedCell, setSelectedCell] = useState<{ td: TimeDepth; ad: AssetDepth } | null>(null);
  const [hoveredCell, setHoveredCell] = useState<{ td: TimeDepth; ad: AssetDepth } | null>(null);

  const selected = selectedCell ? matrix.cells[selectedCell.td]?.[selectedCell.ad] : undefined;
  const rowHeaderClass = compact ? "grid-cols-[72px_repeat(4,1fr)]" : "grid-cols-[100px_repeat(4,1fr)]";

  return (
    <div className="w-full">
      {!compact ? (
        <div className="mb-4">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[#E8473F]/10 px-2 py-0.5 text-[10px] font-medium text-[#E8473F]">
              {matrix.event.category.replace(/_/g, " ")}
            </span>
            <span className="text-[10px] text-zinc-500">Confidence {matrix.event.confidence}%</span>
          </div>
          <h3 className="mt-1 text-[14px] font-semibold text-zinc-100">{matrix.event.title}</h3>
        </div>
      ) : null}

      {!compact ? <MatrixLegend /> : null}

      <div className={cn(compact ? "overflow-x-auto" : "mt-4 overflow-x-auto")}>
        <div className={compact ? "min-w-[480px]" : "min-w-[640px]"}>
          <div className={cn("mb-1 grid gap-1", rowHeaderClass)}>
            <div />
            {ASSET_DEPTHS.map((ad) => (
              <div key={ad} className={cn("text-center", compact ? "py-0.5" : "py-1.5")}>
                <p
                  className={cn(
                    "font-semibold uppercase tracking-[0.14em] text-zinc-500",
                    compact ? "text-[8px]" : "text-[10px]",
                  )}
                >
                  <TooltipTerm label={MATRIX_ASSET_TOOLTIPS[ad]} className="uppercase tracking-[0.14em]">
                    {ASSET_DEPTH_LABELS[ad]}
                  </TooltipTerm>
                </p>
              </div>
            ))}
          </div>

          {TIME_DEPTHS.map((td) => (
            <div key={td} className={cn("mb-1 grid gap-1", rowHeaderClass)}>
              <div className="flex items-center pr-2">
                <div>
                  <p className={cn("font-semibold text-zinc-400", compact ? "text-[9px]" : "text-[10px]")}>
                    {td === "L1_confirmed" ? (
                      <DepthDepthLabel depth="D1" kicker="D1" />
                    ) : td === "L2_this_week" ? (
                      <DepthDepthLabel depth="D2" kicker="D2" />
                    ) : td === "L3_this_month" ? (
                      <DepthDepthLabel depth="D3" kicker="D3" />
                    ) : (
                      <DepthDepthLabel depth="D4" kicker="D4" />
                    )}
                  </p>
                  {!compact ? (
                    <p className="text-[9px] leading-tight text-zinc-600">
                      {TIME_DEPTH_LABELS[td].replace(/^Confirmed /, "")}
                    </p>
                  ) : null}
                </div>
              </div>

              {ASSET_DEPTHS.map((ad) => {
                const cell = matrix.cells[td]?.[ad];
                return (
                  <MatrixGridCell
                    key={`${td}-${ad}`}
                    cell={cell}
                    compact={compact}
                    isHovered={hoveredCell?.td === td && hoveredCell?.ad === ad}
                    onHover={() => setHoveredCell({ td, ad })}
                    onLeave={() => setHoveredCell(null)}
                    onClick={() => cell && setSelectedCell({ td, ad })}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {selectedCell && selected && !compact ? (
        <MatrixCellDetail
          cell={selected}
          timeDepth={selectedCell.td}
          assetDepth={selectedCell.ad}
          onClose={() => setSelectedCell(null)}
          treeSlot={detailTreeSlot}
        />
      ) : null}
    </div>
  );
}

function MatrixGridCell({
  cell,
  compact,
  isHovered,
  onHover,
  onLeave,
  onClick,
}: {
  cell?: MatrixCell;
  compact: boolean;
  isHovered: boolean;
  onHover: () => void;
  onLeave: () => void;
  onClick: () => void;
}) {
  const cellHeight = compact ? "h-24" : "h-32";

  if (!cell) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-md border border-dashed border-white/[0.04] bg-zinc-900/20",
          cellHeight,
        )}
        aria-hidden
      >
        <span className="text-[9px] text-zinc-700">—</span>
      </div>
    );
  }

  const isEdge = cell.mispricingScore >= 50;
  const directionClass =
    cell.direction === "up"
      ? "text-emerald-400"
      : cell.direction === "down"
        ? "text-red-400"
        : "text-zinc-500";
  const arrow = cell.direction === "up" ? "↑" : cell.direction === "down" ? "↓" : "→";

  return (
    <button
      type="button"
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onClick={onClick}
      className={cn(
        "flex cursor-pointer flex-col justify-between overflow-hidden rounded-md border text-left transition-all",
        cellHeight,
        compact ? "p-1.5" : "p-2",
        isEdge ? "border-[#E8473F]/30 bg-[#E8473F]/[0.06]" : "border-white/[0.06] bg-zinc-900/40",
        isHovered && "border-[#E8473F]/40 ring-1 ring-[#E8473F]/40",
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="flex min-w-0 items-center gap-1">
          <span className={cn("shrink-0 font-bold", compact ? "text-[9px]" : "text-[11px]", directionClass)}>
            {arrow} {cell.assetSymbol}
          </span>
          {cell.hasThesis ? <span className="shrink-0 text-[8px] text-[#E8473F]">★</span> : null}
        </div>
        <span
          className={cn("shrink-0 tabular-nums text-zinc-400", compact ? "text-[8px]" : "text-[9px]")}
          title="Priced in"
        >
          {cell.pricedInPercent}% in
        </span>
      </div>

      <p
        className={cn(
          "leading-snug text-zinc-400",
          compact ? "line-clamp-1 text-[8px]" : "line-clamp-2 text-[9px]",
        )}
      >
        {cell.whyItMatters}
      </p>

      <div>
        <div className="flex items-center justify-between gap-1 text-[8px]">
          <span className="text-zinc-500">{cell.pricedInPercent}% priced in</span>
          <span className={cn(isEdge ? "text-[#E8473F]" : "text-zinc-600")}>
            Edge {cell.mispricingScore}/100
          </span>
        </div>
        <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-zinc-800">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              cell.pricedInPercent >= 70
                ? "bg-red-500/50"
                : cell.pricedInPercent >= 40
                  ? "bg-amber-500/50"
                  : "bg-emerald-500/50",
            )}
            style={{ width: `${Math.min(100, Math.max(0, cell.pricedInPercent))}%` }}
          />
        </div>
        {cell.timeHorizon && !compact ? (
          <p className="mt-0.5 truncate text-[7px] text-zinc-600">{cell.timeHorizon}</p>
        ) : null}
        {cell.hasThesis && cell.thesisSlug ? (
          <p className="mt-0.5 truncate text-[7px] text-zinc-600">{cell.thesisSlug}</p>
        ) : null}
      </div>
    </button>
  );
}

function MatrixLegend() {
  return (
    <div className="flex flex-wrap gap-3 text-[9px] text-zinc-500">
      <span className="flex items-center gap-1">
        <span className="h-2 w-2 rounded-sm border border-[#E8473F]/30 bg-[#E8473F]/[0.06]" />
        Edge (mispricing ≥50)
      </span>
      <span className="flex items-center gap-1">
        <span className="h-2 w-2 rounded-sm border border-white/[0.06] bg-zinc-900/40" />
        Watch
      </span>
      <span className="flex items-center gap-1">
        <span className="text-[8px] text-[#E8473F]">★</span>
        Has thesis
      </span>
      <span className="flex items-center gap-1">
        <span className="h-1 w-4 rounded-full bg-red-500/50" />
        Priced in
      </span>
      <span className="flex items-center gap-1">
        <span className="h-1 w-4 rounded-full bg-emerald-500/50" />
        Not priced in
      </span>
    </div>
  );
}
