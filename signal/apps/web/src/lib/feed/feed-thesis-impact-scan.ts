import type { MacroEventReasoning } from "@/lib/macro-reasoning/schema";

export type ThesisRelation = MacroEventReasoning["thesis_relation"];

/** One-line feed scan copy — no L1–L4, no macro essays (detail / drawer only). */
export function thesisRelationToScanImpactLine(relation: ThesisRelation): string {
  switch (relation) {
    case "confirm":
      return "Strengthens this thesis.";
    case "contradict":
      return "Weakens this thesis.";
    case "adjacent":
      return "Related signal, no trigger yet.";
    case "create_new":
      return "Interesting, but not a clean thesis update yet.";
    case "irrelevant":
    default:
      return "Watch only — not enough yet.";
  }
}
