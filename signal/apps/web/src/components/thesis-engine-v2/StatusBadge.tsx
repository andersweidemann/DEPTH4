import type { ThesisStatus } from "@/lib/thesis-engine-v2/types";
import { cn } from "@/lib/utils";
import { Tooltip } from "./Tooltip";

const COPY: Record<ThesisStatus, string> = {
  forming: "Forming",
  watching: "Watching",
  ready: "Ready",
  active: "Active",
  resolved: "Resolved",
  invalidated: "Invalidated",
};

const TOOLTIP: Record<ThesisStatus, string> = {
  ready: "Entry conditions met according to thesis framework",
  forming: "Thesis is forming, not yet actionable",
  watching: "Monitoring for setup conditions",
  active: "Position open and being tracked",
  resolved: "Thesis outcome confirmed",
  invalidated: "Thesis conditions no longer valid",
};

export function StatusBadge({ status, showHint = false }: { status: ThesisStatus; showHint?: boolean }) {
  void showHint;

  return (
    <Tooltip label={TOOLTIP[status]}>
      <span
        className={cn(
          "inline-flex rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]",
          // Text-only: avoid decorative filled pills.
          status === "ready" && "text-zinc-300",
          status === "active" && "text-zinc-300",
          status === "watching" && "text-zinc-500",
          status === "forming" && "text-zinc-600",
          status === "resolved" && "text-zinc-500",
          status === "invalidated" && "text-red-300/90",
        )}
      >
        {COPY[status]}
      </span>
    </Tooltip>
  );
}
