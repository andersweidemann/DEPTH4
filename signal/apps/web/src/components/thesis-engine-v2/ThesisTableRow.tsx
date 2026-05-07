"use client";

import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { cn } from "@/lib/utils";
import { ThesisStarButton } from "@/components/thesis-engine-v2/ThesisStarButton";
import { Tooltip } from "@/components/thesis-engine-v2/Tooltip";

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
  onToggleStar,
  onSelect,
}: {
  thesis: Thesis;
  selected: boolean;
  pulseKey?: number;
  starred: boolean;
  starDisabled?: boolean;
  onToggleStar: () => void;
  onSelect: () => void;
}) {
  const pill = statusPill(thesis.status);
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
        "grid grid-cols-[1fr_76px_92px_96px_44px] items-center gap-2 px-3 py-1.5 text-left",
        "border-b border-white/[0.05] hover:bg-zinc-900/25",
        selected && "bg-zinc-900/45",
        pulseKey && pulseKey > 0 && "animate-[thesis-pulse_0.85s_ease-out_1]",
      )}
    >
      <div className="min-w-0">
        <p className="truncate text-[12px] font-medium text-zinc-100">{thesis.title}</p>
      </div>

      <div className="text-right text-[12px] font-semibold tabular-nums text-amber-200/90">
        <Tooltip label="Likelihood estimate based on current evidence">
          <span>{thesis.probability}%</span>
        </Tooltip>
      </div>

      <div className="flex justify-end">
        <Tooltip label={STATUS_TOOLTIP[thesis.status]}>
          <span className={cn("text-[10px] font-semibold uppercase tracking-[0.14em]", pill.className)}>{pill.label}</span>
        </Tooltip>
      </div>

      <div className="text-right font-mono text-[11px] tabular-nums text-zinc-500">{thesis.lastUpdated}</div>

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
  );
}

