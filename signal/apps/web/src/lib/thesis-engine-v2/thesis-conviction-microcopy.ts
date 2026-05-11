/**
 * User-facing copy for Thesis conviction vs scenario resolution paths (DEPTH4).
 */

export const THESIS_CONVICTION_LABEL = "Thesis conviction";

export const THESIS_CONVICTION_TOOLTIP =
  "Chance this thesis is broadly right over the stated horizon. Calculated as Clean win + Messy win.";

/** Shown under the hero conviction number when space allows. */
export const THESIS_CONVICTION_EXPLAINER_PREFERRED =
  "Thesis conviction is DEPTH4’s estimate that this idea is broadly right over this horizon. It equals Clean win + Messy win. The paths below show how that payoff is most likely to arrive.";

/** Compact variant for narrow layouts. */
export const THESIS_CONVICTION_EXPLAINER_SHORT =
  "Conviction = chance this thesis is broadly right. Clean + Messy make up conviction; Broken is the risk the thesis fails.";

export const SCENARIO_SECTION_SUBTITLE = "How this can play out";

export const SCENARIO_PATHS_DEFINITION =
  "These percentages show how this thesis is most likely to resolve: Clean win pays roughly as planned; Messy win is directionally right but slower or choppier; Thesis broken means the thesis is invalidated.";

export const SCENARIO_PROBABILITIES_POPOVER_TITLE = "How to read these probabilities";

export const SCENARIO_PROBABILITIES_POPOVER_DISCLAIMER =
  "These are DEPTH4 estimates based on live macro, news, and market signals. They are not investment advice.";

export const GENERIC_CONVICTION_USE_COPY =
  "Use conviction to judge whether the idea is worth running at all. Use the scenario split to judge how aggressively to size it and how patient to be.";

const HIGH_CONVICTION_MIN = 55;

/**
 * One-line guidance under the conviction block from Clean / Messy / Broken split.
 */
export function thesisConvictionActionGuidance(clean: number, messy: number, broken: number): string {
  const conviction = clean + messy;
  const brokenIsDominant = broken >= clean && broken >= messy;
  const messyDominatesPaths = messy >= clean && messy >= broken;
  const cleanDominatesPaths = clean >= messy && clean >= broken;

  if (broken >= 38 && brokenIsDominant) {
    return "Broken risk is rising. Treat that as a warning that invalidation risk is increasing, even if conviction is still above 50%.";
  }
  if (conviction >= HIGH_CONVICTION_MIN && messyDominatesPaths && !brokenIsDominant) {
    return "High conviction, but expect a choppy path. Size normally or slightly lighter, and rely on triggers, stops, and scaling rather than waiting for a clean move.";
  }
  if (conviction >= HIGH_CONVICTION_MIN && cleanDominatesPaths && !brokenIsDominant) {
    return "High conviction with a cleaner payoff path. More of the expected edge comes from the thesis paying as intended.";
  }
  return GENERIC_CONVICTION_USE_COPY;
}
