import type { ThesisStatus } from "@/lib/thesis-engine-v2/types";
import { cn } from "@/lib/utils";

const COPY: Record<ThesisStatus, string> = {
  watching: "Watching",
  actionable: "Actionable",
  active: "Active",
  resolved: "Resolved",
  invalidated: "Invalidated",
};

export function StatusBadge({ status }: { status: ThesisStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded px-2 py-0.5 text-[10px] font-medium capitalize tracking-wide",
        status === "actionable" && "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/25",
        status === "active" && "bg-zinc-800 text-zinc-300 ring-1 ring-zinc-600/35",
        status === "watching" && "bg-zinc-900 text-zinc-500 ring-1 ring-zinc-700/50",
        status === "resolved" && "bg-emerald-950/40 text-emerald-500/80 ring-1 ring-emerald-500/15",
        status === "invalidated" && "bg-red-950/40 text-red-400/80 ring-1 ring-red-500/15",
      )}
    >
      {COPY[status]}
    </span>
  );
}
