"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { ThesisTree } from "@/components/causal-map/ThesisTree";
import { MatrixToggle } from "@/components/causal-map/MatrixToggle";
import type { CausalEvent, CausalThesis } from "@/types/causal-graph";
import { cn } from "@/lib/utils";

export interface ThesisMapCardProps {
  thesis: CausalThesis;
  rootEvent: CausalEvent;
  isExpanded: boolean;
  onToggle: () => void;
  hidePricedIn?: boolean;
}

function formatHorizon(horizon: string): string {
  const h = horizon.trim();
  if (h.length <= 22) return h;
  return `${h.slice(0, 20)}…`;
}

export function ThesisMapCard({
  thesis,
  rootEvent,
  isExpanded,
  onToggle,
  hidePricedIn = false,
}: ThesisMapCardProps) {
  const mispricingTone =
    thesis.mispricingScore >= 70
      ? "bg-[#E8473F]/10 text-[#E8473F]"
      : thesis.mispricingScore >= 40
        ? "bg-zinc-500/10 text-zinc-400"
        : "bg-zinc-800 text-zinc-600";

  return (
    <article className="overflow-hidden rounded-lg border border-white/[0.08] bg-zinc-900/30">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-white/[0.02]"
        aria-expanded={isExpanded}
      >
        <span
          className={cn(
            "w-6 text-[14px] font-bold",
            thesis.direction === "up" ? "text-emerald-400" : "text-red-400",
          )}
          aria-hidden
        >
          {thesis.direction === "up" ? "↑" : "↓"}
        </span>

        <span className="w-16 text-[13px] font-semibold text-zinc-200">{thesis.targetAssetSymbol}</span>

        <span className="flex-1 truncate text-[12px] text-zinc-300">{thesis.title}</span>

        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums", mispricingTone)}>
          {thesis.mispricingScore}/100
        </span>

        <span className="hidden w-20 shrink-0 text-right text-[10px] text-zinc-500 sm:block">
          {formatHorizon(thesis.timeHorizon)}
        </span>

        <ChevronDown
          className={cn("ml-2 h-4 w-4 shrink-0 text-zinc-600 transition-transform", isExpanded && "rotate-180")}
          aria-hidden
        />
      </button>

      {isExpanded ? (
        <div className="border-t border-white/[0.06] p-3">
          <p className="text-[12px] leading-relaxed text-zinc-400">{thesis.statement}</p>

          <p className="mt-1 text-[10px] text-zinc-600 sm:hidden">{thesis.timeHorizon}</p>

          <ThesisTree thesis={thesis} rootEvent={rootEvent} hidePricedIn={hidePricedIn} />

          <MatrixToggle thesis={thesis} rootEvent={rootEvent} />

          <Link
            href={`/theses/${thesis.slug}`}
            className="mt-3 inline-block text-[11px] font-medium text-[#E8473F] hover:underline"
          >
            Open full thesis →
          </Link>
        </div>
      ) : null}
    </article>
  );
}
