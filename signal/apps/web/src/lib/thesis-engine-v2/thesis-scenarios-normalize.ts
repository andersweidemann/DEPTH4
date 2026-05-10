import type { ThesisScenario, ThesisScenarioPathKey } from "@/lib/thesis-engine-v2/types";

/** Storage + cron + insider still use these keys; they map to resolution paths (not macro bull/bear). */
export type DbScenarioProbabilityKey = "base" | "bull" | "bear";

const PATH_RANK: Record<ThesisScenarioPathKey, number> = {
  clean_win: 0,
  messy_win: 1,
  thesis_broken: 2,
};

type LegacyLabel = "Base case" | "Bull case" | "Bear case";

export type ThesisScenarioLike = Omit<ThesisScenario, "pathKey" | "label"> & {
  pathKey?: ThesisScenarioPathKey;
  label: ThesisScenario["label"] | LegacyLabel;
};

function inferPathKey(s: ThesisScenarioLike): ThesisScenarioPathKey {
  if (s.pathKey) return s.pathKey;
  if (s.label === "Bull case" || s.label === "Clean win") return "clean_win";
  if (s.label === "Bear case" || s.label === "Thesis broken") return "thesis_broken";
  if (s.label === "Base case" || s.label === "Messy win") return "messy_win";
  return "messy_win";
}

function canonicalLabel(pk: ThesisScenarioPathKey): ThesisScenario["label"] {
  if (pk === "clean_win") return "Clean win";
  if (pk === "messy_win") return "Messy win";
  return "Thesis broken";
}

/** Map legacy Base/Bull/Bear rows to resolution paths for the same trade. */
export function normalizeThesisScenario(s: ThesisScenarioLike): ThesisScenario {
  const pathKey = inferPathKey(s);
  return {
    ...s,
    pathKey,
    label: canonicalLabel(pathKey),
  };
}

export function normalizeThesisScenarios(scenarios: ThesisScenarioLike[]): ThesisScenario[] {
  return [...scenarios].map(normalizeThesisScenario).sort((a, b) => PATH_RANK[a.pathKey] - PATH_RANK[b.pathKey]);
}

export function pathKeyFromDbScenarioKey(k: DbScenarioProbabilityKey): ThesisScenarioPathKey {
  if (k === "bull") return "clean_win";
  if (k === "bear") return "thesis_broken";
  return "messy_win";
}

export function dbScenarioKeyForPathKey(pk: ThesisScenarioPathKey): DbScenarioProbabilityKey {
  if (pk === "clean_win") return "bull";
  if (pk === "thesis_broken") return "bear";
  return "base";
}

export function displayLabelForDbScenarioKey(k: DbScenarioProbabilityKey): string {
  if (k === "bull") return "Clean win";
  if (k === "bear") return "Thesis broken";
  return "Messy win";
}
