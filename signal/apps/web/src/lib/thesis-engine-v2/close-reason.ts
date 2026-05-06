import type { CloseReason } from "@/lib/thesis-engine-v2/types";

export const CLOSE_REASON_OPTIONS: { value: CloseReason; label: string }[] = [
  { value: "target_hit", label: "Target hit" },
  { value: "stop_hit", label: "Stop hit" },
  { value: "manual_exit", label: "Manual exit" },
  { value: "thesis_weakened", label: "Thesis weakened" },
  { value: "thesis_invalidated", label: "Thesis invalidated" },
];

export function closeReasonLabel(r: CloseReason): string {
  return CLOSE_REASON_OPTIONS.find((o) => o.value === r)?.label ?? r;
}

export function isCloseReason(x: unknown): x is CloseReason {
  return (
    x === "target_hit" ||
    x === "stop_hit" ||
    x === "manual_exit" ||
    x === "thesis_weakened" ||
    x === "thesis_invalidated"
  );
}
