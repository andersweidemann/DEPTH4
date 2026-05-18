import type { Thesis } from "@/lib/thesis-engine-v2/types";
import type { ThesisLinkInput } from "@/lib/causal-graph/causal-validator";

export function directionToCausal(direction: string): "up" | "down" {
  if (direction === "long") return "up";
  if (direction === "short") return "down";
  return "down";
}

export function thesisLinkInputFromThesis(thesis: Thesis): ThesisLinkInput {
  const asset = thesis.asset?.trim() || "—";
  const symbol = asset.length > 12 ? asset.split(/[\s/]/)[0]! : asset;
  return {
    slug: thesis.slug,
    title: thesis.title,
    statement: thesis.thesisStatement || thesis.oneLineSummary || thesis.title,
    targetAssetSymbol: symbol,
    direction: directionToCausal(thesis.direction),
  };
}
