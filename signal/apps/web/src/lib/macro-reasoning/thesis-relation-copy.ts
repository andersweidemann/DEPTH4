import type { ThesisRelation } from "@/lib/macro-reasoning/schema";

/** Retail-facing copy for event narrative UI (never show raw enum like "adjacent"). */
export function thesisRelationDisplay(relation: ThesisRelation): string {
  switch (relation) {
    case "confirm":
      return "Confirms thesis";
    case "contradict":
      return "Challenges thesis";
    case "adjacent":
      return "Related signal";
    case "create_new":
      return "New thesis angle";
    case "irrelevant":
    default:
      return "Unlinked";
  }
}
