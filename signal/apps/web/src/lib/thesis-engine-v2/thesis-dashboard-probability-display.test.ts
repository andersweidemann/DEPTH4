import { describe, expect, it } from "vitest";
import { getThesisBySlug } from "@/lib/thesis-engine-v2/catalog-data";
import {
  buildDisplayScenariosFromThesis,
  currentThesisProbabilityFromThesis,
  displayScenarioTripleCleanMessyBroken,
  narrativeFallbackScenariosForThesis,
  overlayDbScenarioProbabilities,
  scenarioOverridesFromRows,
  thesisConvictionPctFromDbTriple,
  thesisWithSyncedLiveProbability,
} from "@/lib/thesis-engine-v2/thesis-display-scenarios";
import { mergeThesis } from "@/lib/thesis-engine-v2/thesis-merge";

/** Proof bundle: default catalog rows share the same template triple → conviction 75% (40+35) after sync. */
const SEED_CATALOG_SLUGS = [
  { slug: "war-peace-gold-short", label: "gold" },
  { slug: "fed-pivot-delayed-tlt-weakness", label: "TLT" },
  { slug: "opec-unity-fracturing", label: "USO/OPEC-style oil" },
  { slug: "us-defense-repricing-rtx-lmt", label: "RTX/defense" },
  { slug: "china-stimulus-copper-long", label: "copper" },
] as const;

describe("thesis probability display (catalog + live merge)", () => {
  it("A: initial catalog state — template triple, hero synced to thesis conviction 75", () => {
    for (const { slug } of SEED_CATALOG_SLUGS) {
      const raw = getThesisBySlug(slug);
      expect(raw, slug).toBeTruthy();
      const t = thesisWithSyncedLiveProbability(raw!);
      const fallback = narrativeFallbackScenariosForThesis(t);
      const display = buildDisplayScenariosFromThesis(t, fallback);
      const [c, m, b] = displayScenarioTripleCleanMessyBroken(display);
      expect(currentThesisProbabilityFromThesis(t)).toBe(75);
      expect(t.probability).toBe(75);
      expect([c, m, b]).toEqual([40, 35, 25]);
    }
  });

  it("B + D: first live analysis — non-seed DB triple updates Scenario View and hero (dashboard/detail same helpers)", () => {
    const raw = getThesisBySlug("war-peace-gold-short")!;
    const rows = narrativeFallbackScenariosForThesis(raw);
    const seeded = scenarioOverridesFromRows(rows);
    const liveDb = { base: 28, bull: 52, bear: 20 };
    const patched = overlayDbScenarioProbabilities(seeded, liveDb);
    const merged = thesisWithSyncedLiveProbability(mergeThesis(raw, { scenarioOverrides: patched }));
    const display = buildDisplayScenariosFromThesis(merged, rows);
    const [c, m, b] = displayScenarioTripleCleanMessyBroken(display);
    expect([c, m, b]).toEqual([52, 28, 20]);
    expect(thesisConvictionPctFromDbTriple(liveDb)).toBe(80);
    expect(merged.probability).toBe(80);
    expect(currentThesisProbabilityFromThesis(merged)).toBe(80);
  });

  it("C: refresh / re-merge — seed base does not overwrite when patch is re-applied from persisted live state", () => {
    const raw = getThesisBySlug("war-peace-gold-short")!;
    const rows = narrativeFallbackScenariosForThesis(raw);
    const seeded = scenarioOverridesFromRows(rows);
    const liveDb = { base: 28, bull: 52, bear: 20 };
    const patched = overlayDbScenarioProbabilities(seeded, liveDb);
    const once = thesisWithSyncedLiveProbability(mergeThesis(raw, { scenarioOverrides: patched }));
    const twice = thesisWithSyncedLiveProbability(mergeThesis(raw, { scenarioOverrides: patched }));
    expect(once.probability).toBe(80);
    expect(twice.probability).toBe(80);
    expect(displayScenarioTripleCleanMessyBroken(buildDisplayScenariosFromThesis(twice, rows))).toEqual([52, 28, 20]);
  });

  it("E: evidence headline alignment — hero matches thesis conviction of the same triple used for cards", () => {
    const raw = getThesisBySlug("fed-pivot-delayed-tlt-weakness")!;
    const rows = narrativeFallbackScenariosForThesis(raw);
    const patched = overlayDbScenarioProbabilities(scenarioOverridesFromRows(rows), { base: 48, bull: 32, bear: 20 });
    const live = thesisWithSyncedLiveProbability(mergeThesis(raw, { scenarioOverrides: patched }));
    const conv = thesisConvictionPctFromDbTriple({ base: 48, bull: 32, bear: 20 });
    expect(live.probability).toBe(conv);
    expect(currentThesisProbabilityFromThesis(live)).toBe(conv);
  });
});
