"use client";

import { cn } from "@/lib/utils";
import type { ResolutionCheck, ResolutionCheckStatus } from "@/lib/thesis/check-resolution";
import type { ThesisOutcomeKind } from "@/types/thesis-outcome";

const BANNER_CONFIG: Record<
  Exclude<ResolutionCheckStatus, "active">,
  { icon: string; label: string; border: string; text: string; outcomeLabel: string }
> = {
  won_clean: {
    icon: "✓",
    label: "Target 2 hit — thesis won cleanly",
    border: "border-emerald-500/30 bg-emerald-500/10",
    text: "text-emerald-400",
    outcomeLabel: "won cleanly",
  },
  won_messy: {
    icon: "~",
    label: "Target 1 hit — thesis won messily",
    border: "border-emerald-400/30 bg-emerald-400/10",
    text: "text-emerald-300",
    outcomeLabel: "won messily",
  },
  failed: {
    icon: "✗",
    label: "Stop loss hit — thesis failed",
    border: "border-red-500/30 bg-red-500/10",
    text: "text-red-400",
    outcomeLabel: "failed",
  },
  expired: {
    icon: "○",
    label: "Time horizon expired",
    border: "border-zinc-500/30 bg-zinc-500/10",
    text: "text-zinc-400",
    outcomeLabel: "expired",
  },
  withdrawn: {
    icon: "○",
    label: "Thesis withdrawn",
    border: "border-zinc-500/30 bg-zinc-500/10",
    text: "text-zinc-400",
    outcomeLabel: "withdrawn",
  },
  superseded: {
    icon: "○",
    label: "Thesis superseded",
    border: "border-zinc-500/30 bg-zinc-500/10",
    text: "text-zinc-400",
    outcomeLabel: "superseded",
  },
};

interface Props {
  check: ResolutionCheck;
  assetSymbol: string;
  resolving?: boolean;
  onResolve: (outcome: ThesisOutcomeKind) => void;
  onDismiss: () => void;
}

export function ThesisResolutionBanner({
  check,
  assetSymbol,
  resolving = false,
  onResolve,
  onDismiss,
}: Props) {
  if (check.status === "active") return null;

  const config = BANNER_CONFIG[check.status];
  if (!config) return null;

  return (
    <div className={cn("mb-6 rounded-lg border p-4", config.border)}>
      <div className="flex items-center gap-2">
        <span className={cn("text-[14px]", config.text)} aria-hidden>
          {config.icon}
        </span>
        <p className="text-[13px] font-medium text-zinc-200">{config.label}</p>
      </div>
      <p className="mt-1 text-[11px] text-zinc-400">
        {assetSymbol} at {check.currentPrice.toLocaleString("en-US", { maximumFractionDigits: 4 })}
        {check.levelsCrossed.length > 0 ? ` · Crossed: ${check.levelsCrossed.join(", ")}` : ""}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={resolving}
          onClick={() => onResolve(check.status as ThesisOutcomeKind)}
          className="rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-[11px] font-medium text-amber-400 transition-colors hover:bg-amber-500/20 disabled:opacity-50"
        >
          {resolving ? "Saving…" : `Mark as ${config.outcomeLabel} →`}
        </button>
        <button
          type="button"
          disabled={resolving}
          onClick={onDismiss}
          className="px-2 text-[11px] text-zinc-500 hover:text-zinc-300"
        >
          Keep active
        </button>
      </div>
    </div>
  );
}
