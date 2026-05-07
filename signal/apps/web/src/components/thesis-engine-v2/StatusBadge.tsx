import type { ThesisStatus } from "@/lib/thesis-engine-v2/types";
import { cn } from "@/lib/utils";

const COPY: Record<ThesisStatus, string> = {
  forming: "Forming",
  watching: "Watching",
  ready: "Ready",
  active: "Active",
  resolved: "Resolved",
  invalidated: "Invalidated",
};

/** Short helper shown under the main label when `showHint` is true. */
const HINT: Partial<Record<ThesisStatus, string>> = {
  watching: "Not ready yet",
  ready: "Entry setup valid",
  active: "Position open",
};

export function StatusBadge({ status, showHint = false }: { status: ThesisStatus; showHint?: boolean }) {
  const hint = showHint ? HINT[status] : undefined;

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span
        className={cn(
          "inline-flex rounded px-2 py-0.5 text-[10px] font-semibold capitalize tracking-wide",
          // Limit filled pills to: valid/invalid/pending. Everything else is text-only.
          status === "ready" && "bg-amber-500/12 text-amber-200 ring-1 ring-amber-500/25", // valid
          status === "invalidated" && "bg-red-500/10 text-red-200/95 ring-1 ring-red-500/25", // invalid
          status === "forming" && "bg-zinc-900/50 text-zinc-200 ring-1 ring-white/[0.08]", // pending
          status === "active" && "text-zinc-300",
          status === "watching" && "text-zinc-400",
          status === "resolved" && "text-zinc-400",
        )}
      >
        {COPY[status]}
      </span>
      {hint ? <span className="text-[9px] font-medium leading-tight text-zinc-500">{hint}</span> : null}
    </span>
  );
}
