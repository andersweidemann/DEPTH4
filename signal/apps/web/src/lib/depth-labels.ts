import type { AssetDepth } from "@/types/causal-graph";
import type { ThesisScenarioPathKey } from "@/lib/thesis-engine-v2/types";

export const DEPTH_LABELS = {
  D1: {
    label: "D1",
    short: "Days",
    full: "D1 — Days (immediate reaction)",
    tooltip: "Days: immediate market reaction",
  },
  D2: {
    label: "D2",
    short: "Weeks",
    full: "D2 — Weeks (tactical window)",
    tooltip: "Weeks: tactical positioning window",
  },
  D3: {
    label: "D3",
    short: "Months",
    full: "D3 — Months (structural thesis)",
    tooltip: "Months: structural thesis development",
  },
  D4: {
    label: "D4",
    short: "Quarters",
    full: "D4 — Quarters (regime shift)",
    tooltip: "Quarters: regime-level macro shift",
  },
} as const;

export type DepthLabelKey = keyof typeof DEPTH_LABELS;

export const MATRIX_ASSET_TOOLTIPS: Record<AssetDepth, string> = {
  root: "Core asset directly affected by the event",
  direct: "First-order derivative of the root asset",
  indirect: "Second-order effect through related markets",
  speculative: "Long-tail speculative positioning",
};

export const RESOLUTION_PATH_TOOLTIPS: Record<ThesisScenarioPathKey, string> = {
  clean_win: "Best case: thesis resolves favorably within time horizon",
  messy_win: "Base case: partial resolution, delayed or with complications",
  thesis_broken: "Worst case: thesis invalidated by contradictory evidence",
};

export const SCENARIO_PROBABILITY_TOOLTIP =
  "Chance this resolution path plays out over the thesis horizon. Thesis conviction is Clean win + Messy win.";

export const EDGE_SCORE_TOOLTIP = "Conviction × probability × risk/reward — how actionable the setup looks.";

export const QUALITY_SCORE_TOOLTIP = "Structural quality of thesis reasoning (0–100).";

export function formatQualityScore(score: number): string {
  return `${Math.round(score)}/100`;
}
