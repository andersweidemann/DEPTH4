"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ASSET_DEPTHS, ASSET_DEPTH_LABELS, TIME_DEPTH_LABELS } from "@/types/causal-graph";
import type { AssetDepth, CausalMatrixData, MatrixCell, TimeDepth } from "@/types/causal-graph";
import { activeTimeDepths } from "@/lib/causal-matrix/build-matrix";
import { MatrixCellDetail } from "@/components/causal-matrix/MatrixCellDetail";

interface MiniCausalMatrixProps {
  matrix: CausalMatrixData;
}

export function MiniCausalMatrix({ matrix }: MiniCausalMatrixProps) {
  const rows = activeTimeDepths(matrix);
  const displayRows = rows.length > 0 ? rows : (["L2_this_week"] as TimeDepth[]);
  const [selectedCell, setSelectedCell] = useState<{ td: TimeDepth; ad: AssetDepth } | null>(null);
  const selected = selectedCell ? matrix.cells[selectedCell.td]?.[selectedCell.ad] : undefined;

  return (
    <div className="w-full">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
        4×4 causal matrix (this thesis)
      </p>
      <div className="mt-3 overflow-x-auto">
        <div className="min-w-[520px]">
          <div className="mb-1 grid grid-cols-[88px_repeat(4,1fr)] gap-1">
            <div />
            {ASSET_DEPTHS.map((ad) => (
              <div
                key={ad}
                className="py-1 text-center text-[9px] font-semibold uppercase tracking-wider text-zinc-500"
              >
                {ASSET_DEPTH_LABELS[ad]}
              </div>
            ))}
          </div>
          {displayRows.map((td) => (
            <div key={td} className="mb-1 grid grid-cols-[88px_repeat(4,1fr)] gap-1">
              <div className="flex items-center pr-2 text-[9px] text-zinc-500">
                {TIME_DEPTH_LABELS[td]}
              </div>
              {ASSET_DEPTHS.map((ad) => {
                const cell = matrix.cells[td]?.[ad];
                return (
                  <MiniCell
                    key={`${td}-${ad}`}
                    cell={cell}
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
        />
      ) : null}
    </div>
  );
}

function MiniCell({ cell, onClick }: { cell?: MatrixCell; onClick: () => void }) {
  if (!cell) {
    return (
      <div className="flex aspect-square items-center justify-center rounded border border-dashed border-white/[0.04] bg-zinc-900/20">
        <span className="text-[8px] text-zinc-700">—</span>
      </div>
    );
  }
  const isEdge = cell.mispricingScore >= 50;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex aspect-square flex-col items-center justify-center rounded border p-1 text-center transition-colors",
        isEdge ? "border-[#E8473F]/30 bg-[#E8473F]/[0.06]" : "border-white/[0.06] bg-zinc-900/40",
      )}
    >
      <span
        className={cn(
          "text-[9px] font-bold",
          cell.direction === "up" && "text-emerald-400",
          cell.direction === "down" && "text-red-400",
        )}
      >
        {cell.direction === "up" ? "↑" : cell.direction === "down" ? "↓" : "→"}
      </span>
      <span className="text-[10px] font-semibold text-zinc-200">{cell.assetSymbol}</span>
      {cell.hasThesis ? <span className="text-[7px] text-[#E8473F]">★</span> : null}
    </button>
  );
}
