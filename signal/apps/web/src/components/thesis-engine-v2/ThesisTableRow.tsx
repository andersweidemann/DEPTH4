"use client";

import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { cn } from "@/lib/utils";
import { ThesisStarButton } from "@/components/thesis-engine-v2/ThesisStarButton";

function statusPill(status: Thesis["status"]): { label: string; className: string } {
  switch (status) {
    case "ready":
      return { label: "Ready", className: "bg-amber-500/12 text-amber-200 ring-1 ring-amber-500/20" };
    case "active":
      return { label: "Active", className: "bg-zinc-800/70 text-zinc-200 ring-1 ring-white/[0.10]" };
    case "watching":
      return { label: "Watching", className: "bg-zinc-900/50 text-zinc-400 ring-1 ring-white/[0.06]" };
    case "forming":
      return { label: "Forming", className: "bg-zinc-950/40 text-zinc-500 ring-1 ring-white/[0.05]" };
    case "resolved":
      return { label: "Resolved", className: "bg-emerald-950/40 text-emerald-300/80 ring-1 ring-emerald-500/15" };
    case "invalidated":
      return { label: "Invalidated", className: "bg-red-950/40 text-red-300/80 ring-1 ring-red-500/15" };
    default:
      return { label: String(status), className: "bg-zinc-900/50 text-zinc-400 ring-1 ring-white/[0.06]" };
  }
}

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
        "grid grid-cols-[1fr_76px_92px_96px_44px] items-center gap-3 rounded-md px-3 py-2 text-left",
        "hover:bg-zinc-900/30",
        selected && "bg-zinc-900/45 ring-1 ring-amber-500/20",
        pulseKey && pulseKey > 0 && "animate-[thesis-pulse_0.85s_ease-out_1]",
      )}
    >
      <div className="min-w-0">
        <p className="truncate text-[12px] font-medium text-zinc-100">{thesis.title}</p>
      </div>

      <div className="text-right text-[12px] font-semibold tabular-nums text-amber-200/90">{thesis.probability}%</div>

      <div className="flex justify-end">
        <span className={cn("inline-flex rounded px-2 py-0.5 text-[10px] font-semibold tracking-wide", pill.className)}>{pill.label}</span>
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

