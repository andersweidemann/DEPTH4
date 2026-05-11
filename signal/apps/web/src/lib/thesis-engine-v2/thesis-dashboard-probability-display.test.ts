import { describe, expect, it } from "vitest";
import { getThesisBySlug } from "@/lib/thesis-engine-v2/catalog-data";
import {
  buildDisplayScenariosFromThesis,
  currentThesisProbabilityFromThesis,
  displayScenarioTripleCleanMessyBroken,
  leadScenarioProbabilityFromDbTriple,
  narrativeFallbackScenariosForThesis,
  overlayDbScenarioProbabilities,
  scenarioOverridesFromRows,
  shouldHideDashboardNumericProbability,
  thesisWithSyncedLiveProbability,
} from "@/lib/thesis-engine-v2/thesis-display-scenarios";
import { mergeThesis } from "@/lib/thesis-engine-v2/thesis-merge";

/** Proof bundle: default catalog rows share the same template triple → lead 40% after sync. */
const SEED_CATALOG_SLUGS = [
  { slug: "war-peace-gold-short", label: "gold" },
  { slug: "fed-pivot-delayed-tlt-weakness", label: "TLT" },
  { slug: "opec-unity-fracturing", label: "USO/OPEC-style oil" },
  { slug: "us-defense-repricing-rtx-lmt", label: "RTX/defense" },
  { slug: "china-stimulus-copper-long", label: "copper" },
] as const;

describe("dashboard row probability (seed regression guard)", () => {
  it("marks all five catalog defaults as hide-numeric (template triple) and synced lead is 40", () => {
    for (const { slug } of SEED_CATALOG_SLUGS) {
      const raw = getThesisBySlug(slug);
      expect(raw, slug).toBeTruthy();
      const t = thesisWithSyncedLiveProbability(raw!);
      const fallback = narrativeFallbackScenariosForThesis(t);
      const display = buildDisplayScenariosFromThesis(t, fallback);
      const [c, m, b] = displayScenarioTripleCleanMessyBroken(display);
      expect(shouldHideDashboardNumericProbability(t), slug).toBe(true);
      expect(currentThesisProbabilityFromThesis(t)).toBe(40);
      expect(t.probability).toBe(40);
      expect([c, m, b]).toEqual([40, 35, 25]);
    }
  });

  it("shows numeric again when scenario triple diverges from templates", () => {
    const raw = getThesisBySlug("war-peace-gold-short")!;
    const rows = narrativeFallbackScenariosForThesis(raw);
    const seeded = scenarioOverridesFromRows(rows);
    const patched = overlayDbScenarioProbabilities(seeded, { base: 48, bull: 32, bear: 20 });
    const merged = mergeThesis(raw, { scenarioOverrides: patched });
    const live = thesisWithSyncedLiveProbability(merged);
    expect(shouldHideDashboardNumericProbability(live)).toBe(false);
    expect(leadScenarioProbabilityFromDbTriple({ base: 48, bull: 32, bear: 20 })).toBe(48);
    expect(live.probability).toBe(48);
  });
});
