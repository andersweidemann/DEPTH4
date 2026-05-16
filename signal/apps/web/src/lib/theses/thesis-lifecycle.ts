/**
 * Single authority for thesis lifecycle on list/home/archive surfacing.
 * `lifecycle_state` from DB wins; otherwise derive from `status`.
 */
import type { ThesisStatus as EngineStatus } from "@/lib/thesis-engine-v2/types";
import type { ThesisLifecycleState } from "@/types/thesis";
import { THESIS_LIFECYCLE_STATES } from "@/lib/theses/thesis-surfacing-db-constants";

export const TERMINAL_LIFECYCLE_STATES = ["resolved", "invalidated", "archived"] as const;
export type TerminalLifecycleState = (typeof TERMINAL_LIFECYCLE_STATES)[number];

export function parseLifecycleState(v: unknown): ThesisLifecycleState | undefined {
  return typeof v === "string" && (THESIS_LIFECYCLE_STATES as readonly string[]).includes(v)
    ? (v as ThesisLifecycleState)
    : undefined;
}

/** Phase 1 status → lifecycle when DB `lifecycle_state` is absent. */
export function deriveLifecycleStateFromStatus(st: EngineStatus): ThesisLifecycleState {
  if (st === "resolved") return "resolved";
  if (st === "invalidated") return "invalidated";
  if (st === "forming") return "discovered";
  return "live";
}

/** @deprecated Import name kept for existing callers — same as {@link deriveLifecycleStateFromStatus}. */
export const deriveLifecycleState = deriveLifecycleStateFromStatus;

export type ThesisLifecycleInput = {
  lifecycle_state?: unknown;
  status?: unknown;
};

/** Effective lifecycle: DB column first, then status-derived. */
export function effectiveLifecycleState(input: ThesisLifecycleInput): ThesisLifecycleState {
  const parsed = parseLifecycleState(input.lifecycle_state);
  if (parsed != null) return parsed;
  const st = typeof input.status === "string" ? input.status.trim() : "";
  if (st === "resolved" || st === "invalidated") return st;
  if (st === "forming" || st === "watching" || st === "ready" || st === "active") {
    return deriveLifecycleStateFromStatus(st);
  }
  return "live";
}

export function isTerminalLifecycleState(ls: ThesisLifecycleState): boolean {
  return ls === "resolved" || ls === "invalidated" || ls === "archived";
}

export function isTerminalThesis(input: ThesisLifecycleInput): boolean {
  return isTerminalLifecycleState(effectiveLifecycleState(input));
}

/** List API `ThesisStatus` (Pascal) → engine status for lifecycle fallback. */
const LIST_STATUS_TO_ENGINE: Record<string, EngineStatus> = {
  Ready: "ready",
  Active: "active",
  Watching: "watching",
  Draft: "forming",
};

/** Status dot / label on `/theses` list rows when `lifecycle_state` is present on the item. */
export function listRowLifecyclePresentation(item: {
  status: string;
  lifecycle_state?: ThesisLifecycleState;
}): { label: string; dotClass: string; textClass: string; lifecycle: ThesisLifecycleState } {
  const lifecycle =
    item.lifecycle_state ??
    effectiveLifecycleState({
      status: LIST_STATUS_TO_ENGINE[item.status] ?? item.status.toLowerCase(),
    });
  if (lifecycle === "resolved") {
    return {
      lifecycle,
      label: "resolved",
      dotClass: "bg-emerald-500/80",
      textClass: "text-emerald-400/90",
    };
  }
  if (lifecycle === "invalidated") {
    return {
      lifecycle,
      label: "invalidated",
      dotClass: "bg-red-500/80",
      textClass: "text-red-400/90",
    };
  }
  if (lifecycle === "archived") {
    return {
      lifecycle,
      label: "archived",
      dotClass: "bg-zinc-600",
      textClass: "text-zinc-500",
    };
  }
  return {
    lifecycle,
    label: item.status.toLowerCase(),
    dotClass:
      item.status === "Ready"
        ? "bg-amber-400"
        : item.status === "Active"
          ? "bg-zinc-500"
          : item.status === "Watching"
            ? "bg-zinc-600"
            : "bg-zinc-700",
    textClass:
      item.status === "Ready"
        ? "text-amber-400"
        : item.status === "Active"
          ? "text-zinc-400"
          : item.status === "Watching"
            ? "text-zinc-500"
            : "text-zinc-600",
  };
}
