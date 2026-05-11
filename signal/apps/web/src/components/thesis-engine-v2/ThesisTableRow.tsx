"use client";

import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { cn } from "@/lib/utils";
import { formatThesisMicroLabel, getThesisDisplayTitle } from "@/lib/thesis-engine-v2/thesis-display-title";
import { ThesisStarButton } from "@/components/thesis-engine-v2/ThesisStarButton";
import { Tooltip } from "@/components/thesis-engine-v2/Tooltip";
import { getThesisMispricing } from "@/lib/thesis-engine-v2/mispricing";
import { MispricingTooltipContent } from "@/components/thesis-engine-v2/MispricingTooltipContent";

function statusPill(status: Thesis["status"]): { label: string; className: string } {
  switch (status) {
    case "ready":
      return { label: "Ready", className: "text-amber-200" };
    case "active":
      return { label: "Active", className: "text-zinc-200" };
    case "watching":
      return { label: "Watching", className: "text-zinc-400" };
    case "forming":
      return { label: "Forming", className: "text-zinc-500" };
    case "resolved":
      return { label: "Resolved", className: "text-emerald-300/80" };
    case "invalidated":
      return { label: "Invalidated", className: "text-red-300/80" };
    default:
      return { label: String(status), className: "text-zinc-400" };
  }
}

const STATUS_TOOLTIP: Record<Thesis["status"], string> = {
  ready: "Entry conditions met according to thesis framework",
  forming: "Thesis is forming, not yet actionable",
  watching: "Monitoring for setup conditions",
  active: "Position open and being tracked",
  resolved: "Thesis outcome confirmed",
  invalidated: "Thesis conditions no longer valid",
};

export function ThesisTableRow({
  thesis,
  selected,
  pulseKey,
  starred,
  starDisabled,
  hideNumericProbability,
  onToggleStar,
  onSelect,
}: {
  thesis: Thesis;
  selected: boolean;
  pulseKey?: number;
  starred: boolean;
  starDisabled?: boolean;
  /** When true, row probability still matches a seed/template scenario mix — show “Calibrating”, not a fake exact %. */
  hideNumericProbability?: boolean;
  onToggleStar: () => void;
  onSelect: () => void;
}) {
  const pill = statusPill(thesis.status);
  const mispricing = getThesisMispricing(thesis);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "grid grid-cols-1 gap-2 px-3 py-4 text-left",
        "border-b border-white/[0.05] hover:bg-white/[0.02]",
        selected && "bg-zinc-900/45",
        pulseKey && pulseKey > 0 && "animate-[thesis-pulse_0.85s_ease-out_1]",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {formatThesisMicroLabel(thesis.microLabel) ? (
            <p className="text-[10px] font-medium leading-snug text-zinc-500">{formatThesisMicroLabel(thesis.microLabel)}</p>
          ) : null}
          <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1", formatThesisMicroLabel(thesis.microLabel) ? "mt-0.5" : "")}>
            <p className="truncate text-[14px] font-semibold text-zinc-100">{getThesisDisplayTitle(thesis)}</p>
            <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">{thesis.direction}</span>
            <Tooltip label={STATUS_TOOLTIP[thesis.status]}>
              <span className={cn("text-[10px] font-semibold uppercase tracking-[0.14em]", pill.className)}>{pill.label}</span>
            </Tooltip>
          </div>
          <p className="mt-1 line-clamp-1 text-[12px] text-zinc-500">
            Why now: {thesis.whyNow || thesis.thesisStatement || "—"}
          </p>
        </div>

        <div className="flex flex-shrink-0 items-center gap-6">
          <div className="min-w-[140px] text-right">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-[1px] bg-white/10">
                {hideNumericProbability ? (
                  <div className="h-full w-full bg-zinc-700/45" aria-hidden />
                ) : (
                  <div className="h-full bg-amber-400/90" style={{ width: `${Math.max(0, Math.min(100, thesis.probability))}%` }} />
                )}
              </div>
              {hideNumericProbability ? (
                <Tooltip label="Scenario mix is still on the default template; a precise headline % appears once live evidence moves weights off the seed.">
                  <span className="text-[12px] font-semibold tabular-nums text-zinc-500">Calibrating</span>
                </Tooltip>
              ) : (
                <Tooltip label="Likelihood estimate based on current evidence">
                  <span className="text-[12px] font-semibold tabular-nums text-zinc-300">{thesis.probability}%</span>
                </Tooltip>
              )}
            </div>
            <div className="mt-1 text-[10px] tabular-nums text-zinc-600">
              <Tooltip label={<MispricingTooltipContent m={mispricing} />}>
                <span>score {mispricing.score}</span>
              </Tooltip>
            </div>
          </div>

          <div className="hidden text-right font-mono text-[11px] tabular-nums text-zinc-600 sm:block">{thesis.lastUpdated}</div>

          <div className="flex justify-end">
            <ThesisStarButton
              size="sm"
              filled={starred}
              disabled={starDisabled}
              title={starDisabled ? "Star unavailable" : starred ? "Starred — alerts on" : "Star — subscribe to alerts"}
              onClick={onToggleStar}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

