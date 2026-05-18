import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ASSET_DEPTH_LABELS, TIME_DEPTH_LABELS } from "@/types/causal-graph";
import type { AssetDepth, MatrixCell, TimeDepth } from "@/types/causal-graph";

interface MatrixCellDetailProps {
  cell: MatrixCell;
  timeDepth: TimeDepth;
  assetDepth: AssetDepth;
  onClose: () => void;
  treeSlot?: ReactNode;
}

export function MatrixCellDetail({
  cell,
  timeDepth,
  assetDepth,
  onClose,
  treeSlot,
}: MatrixCellDetailProps) {
  return (
    <div className="mt-4 rounded-lg border border-white/[0.08] bg-[#111110]/80 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "text-[14px] font-bold",
                cell.direction === "up" && "text-emerald-400",
                cell.direction === "down" && "text-red-400",
                cell.direction === "neutral" && "text-zinc-400",
              )}
            >
              {cell.direction === "up" ? "↑" : cell.direction === "down" ? "↓" : "→"} {cell.assetSymbol}
            </span>
            <span className="text-[10px] text-zinc-500">
              {TIME_DEPTH_LABELS[timeDepth]} · {ASSET_DEPTH_LABELS[assetDepth]}
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">{cell.whyItMatters}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-[11px] text-zinc-500 transition-colors hover:text-zinc-300"
        >
          Close
        </button>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        <Metric label="Strength" value={`${cell.strength}%`} />
        <Metric label="Priced in" value={`${cell.pricedInPercent}%`} />
        <Metric
          label="Mispricing"
          value={`${cell.mispricingScore}/100`}
          valueClassName={cell.mispricingScore >= 50 ? "text-[#E8473F]" : "text-zinc-400"}
        />
      </div>

      {cell.hasThesis && cell.thesisSlug ? (
        <Link
          href={`/theses/${cell.thesisSlug}`}
          className="mt-3 block rounded-md border border-[#E8473F]/25 bg-[#E8473F]/5 p-2.5 transition-colors hover:bg-[#E8473F]/10"
        >
          <p className="text-[10px] text-[#E8473F]">★ {cell.thesisTitle ?? cell.thesisSlug}</p>
          <p className="mt-0.5 text-[10px] text-zinc-500">View thesis →</p>
        </Link>
      ) : (
        <Link
          href={`/theses?create=1&asset=${encodeURIComponent(cell.assetSymbol)}`}
          className="mt-3 block w-full rounded-md border border-white/[0.06] bg-zinc-900/50 p-2 text-center text-[10px] text-[#E8473F] transition-colors hover:bg-[#E8473F]/10"
        >
          Create thesis for {cell.assetSymbol} →
        </Link>
      )}

      {treeSlot ? <div className="mt-4 border-t border-white/[0.06] pt-4">{treeSlot}</div> : null}
    </div>
  );
}

function Metric({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-[0.14em] text-zinc-600">{label}</p>
      <p className={cn("text-[12px] text-zinc-300", valueClassName)}>{value}</p>
    </div>
  );
}
