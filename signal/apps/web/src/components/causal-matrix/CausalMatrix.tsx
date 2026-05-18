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
import { MatrixCellDetail } from "@/components/causal-matrix/MatrixCellDetail";

interface CausalMatrixProps {
  matrix: CausalMatrixData;
  detailTreeSlot?: ReactNode;
}

export function CausalMatrix({ matrix, detailTreeSlot }: CausalMatrixProps) {
  const [selectedCell, setSelectedCell] = useState<{ td: TimeDepth; ad: AssetDepth } | null>(null);
  const [hoveredCell, setHoveredCell] = useState<{ td: TimeDepth; ad: AssetDepth } | null>(null);

  const selected = selectedCell ? matrix.cells[selectedCell.td]?.[selectedCell.ad] : undefined;

  return (
    <div className="w-full">
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[#E8473F]/10 px-2 py-0.5 text-[10px] font-medium text-[#E8473F]">
            {matrix.event.category.replace(/_/g, " ")}
          </span>
          <span className="text-[10px] text-zinc-500">Confidence {matrix.event.confidence}%</span>
        </div>
        <h3 className="mt-1 text-[14px] font-semibold text-zinc-100">{matrix.event.title}</h3>
      </div>

      <MatrixLegend />

      <div className="mt-4 overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="mb-1 grid grid-cols-[100px_repeat(4,1fr)] gap-1">
            <div />
            {ASSET_DEPTHS.map((ad) => (
              <div key={ad} className="py-1.5 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                  {ASSET_DEPTH_LABELS[ad]}
                </p>
              </div>
            ))}
          </div>

          {TIME_DEPTHS.map((td) => (
            <div key={td} className="mb-1 grid grid-cols-[100px_repeat(4,1fr)] gap-1">
              <div className="flex items-center pr-2">
                <div>
                  <p className="text-[10px] font-semibold text-zinc-400">
                    {td === "L1_confirmed" && "L1"}
                    {td === "L2_this_week" && "L2"}
                    {td === "L3_this_month" && "L3"}
                    {td === "L4_this_quarter" && "L4"}
                  </p>
                  <p className="text-[9px] leading-tight text-zinc-600">
                    {TIME_DEPTH_LABELS[td].replace(/^Confirmed /, "")}
                  </p>
                </div>
              </div>

              {ASSET_DEPTHS.map((ad) => {
                const cell = matrix.cells[td]?.[ad];
                return (
                  <MatrixGridCell
                    key={`${td}-${ad}`}
                    cell={cell}
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

      {selectedCell && selected ? (
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
  isHovered,
  onHover,
  onLeave,
  onClick,
}: {
  cell?: MatrixCell;
  isHovered: boolean;
  onHover: () => void;
  onLeave: () => void;
  onClick: () => void;
}) {
  if (!cell) {
    return (
      <div
        className="flex aspect-square items-center justify-center rounded-md border border-dashed border-white/[0.04] bg-zinc-900/20"
        aria-hidden
      >
        <span className="text-[9px] text-zinc-700">—</span>
      </div>
    );
  }

  const isEdge = cell.mispricingScore >= 50;
  const isPricedIn = cell.pricedInPercent >= 70;

  return (
    <button
      type="button"
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onClick={onClick}
      className={cn(
        "relative flex aspect-square cursor-pointer flex-col justify-between overflow-hidden rounded-md border p-2 text-left transition-all",
        isEdge && !isPricedIn && "border-[#E8473F]/30 bg-[#E8473F]/[0.06]",
        isEdge && isPricedIn && "border-[#E8473F]/15 bg-[#E8473F]/[0.03]",
        !isEdge && "border-white/[0.06] bg-zinc-900/40",
        isHovered && "border-[#E8473F]/40 ring-1 ring-[#E8473F]/40",
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "text-[10px] font-bold",
            cell.direction === "up" && "text-emerald-400",
            cell.direction === "down" && "text-red-400",
            cell.direction === "neutral" && "text-zinc-500",
          )}
        >
          {cell.direction === "up" ? "↑" : cell.direction === "down" ? "↓" : "→"}
        </span>
        {cell.hasThesis ? <span className="text-[8px] text-[#E8473F]">★</span> : null}
      </div>

      <div className="text-center">
        <span className="text-[11px] font-semibold text-zinc-200">{cell.assetSymbol}</span>
      </div>

      <div>
        <div className="h-1 overflow-hidden rounded-full bg-zinc-800">
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
        <div className="mt-0.5 flex justify-between">
          <span className="text-[7px] text-zinc-600">{cell.pricedInPercent}%PI</span>
          <span
            className={cn("text-[7px]", cell.mispricingScore >= 50 ? "text-[#E8473F]" : "text-zinc-600")}
          >
            {cell.mispricingScore}M
          </span>
        </div>
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
