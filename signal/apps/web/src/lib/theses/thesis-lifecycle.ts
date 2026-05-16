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
