"use client";

import { cn } from "@/lib/utils";
import type { UserThesisCalibrationPhase } from "@/lib/thesis/user-thesis-lifecycle";
import type { Thesis } from "@/lib/thesis-engine-v2/types";

type BadgeThesis = Pick<Thesis, "origin" | "thesisOrigin" | "status" | "userCalibration">;

function phaseFromThesis(thesis: BadgeThesis): UserThesisCalibrationPhase | null {
  if (thesis.origin !== "user" && thesis.thesisOrigin !== "user") return null;
  const phase = thesis.userCalibration?.phase;
  if (phase === "tradeable" || thesis.status === "ready" || thesis.status === "active") return "tradeable";
  if (phase === "watching_no_edge") return "watching_no_edge";
  if (phase === "assessing" || thesis.status === "watching" || thesis.status === "forming") return "assessing";
  return phase ?? null;
}

export function UserThesisLifecycleBadge({
  thesis,
  className,
}: {
  thesis: BadgeThesis;
  className?: string;
}) {
  const phase = phaseFromThesis(thesis);
  if (!phase) return null;

  const tradeable = phase === "tradeable";
  return (
    <span
      className={cn(
        "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[10px] font-bold uppercase tracking-tight",
        tradeable
          ? "border-[#E8473F]/50 bg-[#E8473F]/15 text-[#E8473F]"
          : "border-dashed border-zinc-600/60 bg-zinc-900/40 text-zinc-500",
        className,
      )}
      title={tradeable ? "Tradeable — calibrated edge" : "Watching — hypothesis under assessment"}
      aria-label={tradeable ? "Tradeable thesis" : "Watching thesis"}
    >
      {tradeable ? "T" : "W"}
    </span>
  );
}
