import { describe, expect, it } from "vitest";
import { buildThesisAssetEdgeRows } from "@/components/thesis-engine-v2/ThesisAssetEdgeMap";
import { getThesisDetail } from "@/lib/thesis-engine-v2/catalog-data";
import { CATALOG_RELATED_ASSETS_BY_SLUG } from "@/lib/thesis-engine-v2/catalog-edge-assets";

describe("catalog thesis asset edge map (canonical copper + globals)", () => {
  it("china-stimulus copper: no COPPER card, HG + multi-instrument structured playbook", () => {
    const bundle = getThesisDetail("china-stimulus-copper-long");
    expect(bundle).toBeDefined();
    const { thesis, relatedAssets } = bundle!;
    expect(relatedAssets.length).toBeGreaterThanOrEqual(5);
    expect(relatedAssets.some((a) => a.symbol === "COPPER")).toBe(false);
    expect(relatedAssets.some((a) => a.symbol === "HG")).toBe(true);
    expect(relatedAssets.some((a) => a.symbol === "FCX")).toBe(true);
    expect(relatedAssets.some((a) => a.symbol === "SCCO")).toBe(true);
    expect(relatedAssets.some((a) => a.symbol === "TLT")).toBe(true);
    for (const a of relatedAssets) {
      expect((a.whyItMatters ?? "").trim().length).toBeGreaterThan(10);
      expect((a.consensusOnAsset ?? "").trim().length).toBeGreaterThan(10);
      expect((a.whatAssetMisprices ?? "").trim().length).toBeGreaterThan(10);
      expect((a.edgeWindow ?? "").trim().length).toBeGreaterThan(2);
      expect((a.depthConfidence ?? "").trim().length).toBeGreaterThan(2);
    }
    const rows = buildThesisAssetEdgeRows(thesis, relatedAssets);
    expect(rows.some((r) => r.symbol === "COPPER")).toBe(false);
    expect(rows.map((r) => r.symbol)).toContain("HG");
    expect(rows.map((r) => r.symbol)).toContain("FCX");
  });

  it("COPPER is dropped even when insider flow lists it alongside HG", () => {
    const bundle = getThesisDetail("china-stimulus-copper-long");
    expect(bundle).toBeDefined();
    const thesis = {
      ...bundle!.thesis,
      insiderFlow: { ...bundle!.thesis.insiderFlow, bullInstruments: ["HG", "COPPER"] },
    };
    const rows = buildThesisAssetEdgeRows(thesis, bundle!.relatedAssets);
    expect(rows.filter((r) => r.symbol === "COPPER")).toHaveLength(0);
    expect(rows.filter((r) => r.symbol === "HG")).toHaveLength(1);
  });

  it("war-peace gold: at least five structured instruments including XAUUSD and GLD", () => {
    const list = CATALOG_RELATED_ASSETS_BY_SLUG["war-peace-gold-short"];
    expect(list?.length).toBeGreaterThanOrEqual(5);
    const syms = list!.map((a) => a.symbol);
    expect(syms).toContain("XAUUSD");
    expect(syms).toContain("GLD");
  });
});
