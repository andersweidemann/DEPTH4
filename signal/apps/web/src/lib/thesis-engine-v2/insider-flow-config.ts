import type { Thesis } from "@/lib/thesis-engine-v2/types";

export function hasInsiderFlowMonitoring(insiderFlow?: Thesis["insiderFlow"]): boolean {
  if (!insiderFlow) return false;
  const parts = [
    ...(insiderFlow.bullInstruments ?? []),
    ...(insiderFlow.bearInstruments ?? []),
    ...(insiderFlow.confirmTags ?? []),
    ...(insiderFlow.contradictTags ?? []),
  ];
  return parts.some(Boolean);
}

/** Persisted shape for `public.theses.insider_flow`; null when nothing to monitor. */
export function normalizeInsiderFlowForDb(insiderFlow?: Thesis["insiderFlow"]): Record<string, unknown> | null {
  if (!insiderFlow) return null;
  const bull = (insiderFlow.bullInstruments ?? []).map(String).filter(Boolean);
  const bear = (insiderFlow.bearInstruments ?? []).map(String).filter(Boolean);
  const confirm = (insiderFlow.confirmTags ?? []).map(String).filter(Boolean);
  const contradict = (insiderFlow.contradictTags ?? []).map(String).filter(Boolean);
  if (!bull.length && !bear.length && !confirm.length && !contradict.length) return null;
  return {
    bullInstruments: bull,
    bearInstruments: bear,
    confirmTags: confirm,
    contradictTags: contradict,
  };
}

export function scenarioProbabilitiesForDb(thesis: Thesis): { base: number; bull: number; bear: number } {
  if (thesis.scenarioOverrides) {
    return {
      base: thesis.scenarioOverrides.base.probability,
      bull: thesis.scenarioOverrides.bull.probability,
      bear: thesis.scenarioOverrides.bear.probability,
    };
  }
  return { base: 40, bull: 35, bear: 25 };
}

export function insiderFlowFromCommaFields(fields: {
  bullInstruments: string;
  bearInstruments: string;
  confirmTags: string;
  contradictTags: string;
}): NonNullable<Thesis["insiderFlow"]> {
  const split = (s: string) =>
    s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  return {
    bullInstruments: split(fields.bullInstruments),
    bearInstruments: split(fields.bearInstruments),
    confirmTags: split(fields.confirmTags),
    contradictTags: split(fields.contradictTags),
  };
}

export function commaFieldsFromInsiderFlow(insiderFlow?: Thesis["insiderFlow"]): {
  bullInstruments: string;
  bearInstruments: string;
  confirmTags: string;
  contradictTags: string;
} {
  return {
    bullInstruments: (insiderFlow?.bullInstruments ?? []).join(", "),
    bearInstruments: (insiderFlow?.bearInstruments ?? []).join(", "),
    confirmTags: (insiderFlow?.confirmTags ?? []).join(", "),
    contradictTags: (insiderFlow?.contradictTags ?? []).join(", "),
  };
}
