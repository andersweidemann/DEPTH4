import { describe, expect, it } from "vitest";
import {
  computeIsolatedConflictWarnings,
  resolveThesisMapSymbol,
} from "@/lib/causal-map/resolve-thesis-map-symbol";

describe("resolveThesisMapSymbol", () => {
  it("infers USO from oil headline when asset label missing", () => {
    expect(
      resolveThesisMapSymbol({
        assetLabel: "—",
        affects: [],
        title: "Iran escalation under Trump lifts oil & defense, pressures risk assets",
      }),
    ).toBe("USO");
  });

  it("infers DAX from title", () => {
    expect(
      resolveThesisMapSymbol({
        assetLabel: "",
        affects: [],
        title: "DAX shorts as sticky eurozone inflation keeps ECB hawkish",
      }),
    ).toBe("DAX");
  });

  it("detects opposing isolated oil theses", () => {
    const warnings = computeIsolatedConflictWarnings([
      {
        id: "a",
        title: "Oil rally on supply fear",
        targetAssetSymbol: "USO",
        direction: "up",
      },
      {
        id: "b",
        title: "Oil fades on de-escalation",
        targetAssetSymbol: "USO",
        direction: "down",
      },
    ]);
    expect(warnings.length).toBe(1);
    expect(warnings[0]!.conflict).toMatch(/Opposing directions on USO/i);
  });
});
