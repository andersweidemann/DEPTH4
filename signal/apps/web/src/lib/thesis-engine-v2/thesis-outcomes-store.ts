"use client";

export type ManualThesisOutcomeStatus = "resolved" | "invalidated";

export type ManualThesisOutcome = {
  status: ManualThesisOutcomeStatus;
  /** ISO timestamp when the user set the outcome */
  at: string;
};

const KEY = "depth4.v2.thesisOutcomes.v1";

export const DEPTH4_THESIS_OUTCOMES_CHANGED = "depth4:thesis-outcomes-changed";

function safeParse(raw: string | null): Record<string, ManualThesisOutcome> {
  if (!raw) return {};
  try {
    const j = JSON.parse(raw) as unknown;
    if (!j || typeof j !== "object") return {};
    const out: Record<string, ManualThesisOutcome> = {};
    for (const [k, v] of Object.entries(j as Record<string, unknown>)) {
      if (typeof k !== "string" || !v || typeof v !== "object") continue;
      const o = v as Record<string, unknown>;
      if (o.status !== "resolved" && o.status !== "invalidated") continue;
      if (typeof o.at !== "string") continue;
      out[k] = { status: o.status, at: o.at };
    }
    return out;
  } catch {
    return {};
  }
}

export function loadThesisOutcomes(): Record<string, ManualThesisOutcome> {
  if (typeof window === "undefined") return {};
  return safeParse(window.sessionStorage.getItem(KEY));
}

export function getThesisOutcome(thesisId: string): ManualThesisOutcome | undefined {
  return loadThesisOutcomes()[thesisId];
}

export function setThesisOutcome(thesisId: string, outcome: ManualThesisOutcome | null): void {
  if (typeof window === "undefined") return;
  const cur = loadThesisOutcomes();
  const next = { ...cur };
  if (outcome === null) delete next[thesisId];
  else next[thesisId] = outcome;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(DEPTH4_THESIS_OUTCOMES_CHANGED));
  } catch {
    // ignore
  }
}
