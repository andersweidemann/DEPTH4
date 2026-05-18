import { CATALOG_THESES } from "@/lib/thesis-engine-v2/catalog-data";
import { buildDetailResolvableSlugSet, thesisListItemFromEngine } from "../theses-list-response";
import type { Thesis as EngineThesis } from "../../../lib/thesis-engine-v2/types";

describe("detailResolvable guardrail", () => {
  const mockPartition = { tradable: [], emerging: [], monitoring: [], archivePreview: [] } as ReturnType<typeof import("../theses-list-response").partitionHomeBuckets>;

  describe("buildDetailResolvableSlugSet", () => {
    it("should include catalog thesis slugs", () => {
      const catalogSlug = CATALOG_THESES[0]!.slug;
      const resolvableSet = buildDetailResolvableSlugSet([], []);
      expect(resolvableSet.has(catalogSlug)).toBe(true);
    });

    it("should include AI-generated theses with valid UUID thesisId", () => {
      const aiTheses = [{
        slug: "test-ai-slug",
        thesisId: "123e4567-e89b-12d3-a456-426614174000"
      } as EngineThesis];
      const userTheses: EngineThesis[] = [];

      const resolvableSet = buildDetailResolvableSlugSet(aiTheses, userTheses);
      expect(resolvableSet.has("test-ai-slug")).toBe(true);
    });

    it("should exclude AI-generated theses with invalid/missing thesisId", () => {
      const aiTheses = [
        { slug: "test-ai-slug-1", thesisId: "" } as EngineThesis, // empty ID
        { slug: "test-ai-slug-2", thesisId: "invalid-id" } as EngineThesis, // invalid format
        { slug: "test-ai-slug-3" } as EngineThesis // missing ID
      ];
      const userTheses: EngineThesis[] = [];

      const resolvableSet = buildDetailResolvableSlugSet(aiTheses, userTheses);
      expect(resolvableSet.has("test-ai-slug-1")).toBe(false);
      expect(resolvableSet.has("test-ai-slug-2")).toBe(false);
      expect(resolvableSet.has("test-ai-slug-3")).toBe(false);
    });

    it("should include user theses with valid UUID thesisId", () => {
      const aiTheses: EngineThesis[] = [];
      const userTheses = [{
        slug: "test-user-slug",
        thesisId: "123e4567-e89b-12d3-a456-426614174000"
      } as EngineThesis];

      const resolvableSet = buildDetailResolvableSlugSet(aiTheses, userTheses);
      expect(resolvableSet.has("test-user-slug")).toBe(true);
    });

    it("should exclude user theses with invalid/missing thesisId", () => {
      const aiTheses: EngineThesis[] = [];
      const userTheses = [
        { slug: "test-user-slug-1", thesisId: "" } as EngineThesis,
        { slug: "test-user-slug-2", thesisId: "invalid-id" } as EngineThesis,
        { slug: "test-user-slug-3" } as EngineThesis
      ];

      const resolvableSet = buildDetailResolvableSlugSet(aiTheses, userTheses);
      expect(resolvableSet.has("test-user-slug-1")).toBe(false);
      expect(resolvableSet.has("test-user-slug-2")).toBe(false);
      expect(resolvableSet.has("test-user-slug-3")).toBe(false);
    });
  });

  describe("thesisListItemFromEngine defensive overrides", () => {
    const mockResolvableSet = new Set<string>(["resolvable-slug"]);

    it("should set detailResolvable to false for Draft status thesis not in resolvable set", () => {
      const thesis: EngineThesis = {
        id: "01abad62-7f89-43e9-810b-46c8e56154fd",
        slug: "uso-will-find-a-floor-within-this-earnings-s-9535544b43",
        title: "Test thesis",
        statement: "Test statement",
        asset: "TEST",
        assetClass: "Equity",
        direction: "long" as const,
        status: "Draft",
        tradeable: true,
        conviction: 75,
        convictionRationale: "test",
        convictionIsTemplateEstimate: true,
        mispricingScore: 50,
        mispricingComponents: {
          structuralSetup: 10,
          resolutionPathShape: 10,
          convictionAlignment: 10,
          evidenceFreshness: 10,
          convictionVsSetup: 10
        },
        horizon: "test",
        advisory: "test",
        invalidation: "test",
        whyNow: "test",
        whatMarketHasntPriced: "test",
        trigger: "test",
        trade: "test",
        timeStop: "test",
        isEntryValid: true,
        showResolutionPathPercentages: true,
        resolutionPaths: {
          cleanWin: { probability: 40, whatHappens: "test", tradeImpact: "test" },
          messyWin: { probability: 35, whatHappens: "test", tradeImpact: "test" },
          thesisBroken: { probability: 25, whatHappens: "test", tradeImpact: "test" }
        },
        fourLevelCascade: {
          l1: { timeframe: "test", label: "test", description: "test" },
          l2: { timeframe: "test", label: "test", description: "test" },
          l3: { timeframe: "test", label: "test", description: "test" },
          l4: { timeframe: "test", label: "test", description: "test" }
        },
        tradePlan: {
          status: "test",
          rrCheck: "test",
          rrWarning: "test",
          entryZone: "test",
          stop: "test",
          stopColor: "red" as const,
          target1: "test",
          target2: "test",
          timeHorizon: "test",
          recommendation: "test",
          recommendationColor: "emerald" as const
        },
        insiderFlow: {
          bullInstruments: [],
          bearInstruments: [],
          confirmTags: [],
          contradictTags: []
        },
        lastUpdated: new Date().toISOString(),
        thesisId: "01abad62-7f89-43e9-810b-46c8e56154fd"
      };

      const result = thesisListItemFromEngine(
        thesis,
        false,
        null,
        mockPartition,
        mockResolvableSet, // Does NOT contain the thesis slug
        undefined,
      );

      expect(result.detailResolvable).toBe(false);
    });

    it("should set detailResolvable to true for Draft status thesis that IS in resolvable set", () => {
      const thesis: EngineThesis = {
        id: "01abad62-7f89-43e9-810b-46c8e56154fd",
        slug: "resolvable-slug", // This IS in the resolvable set
        title: "Test thesis",
        statement: "Test statement",
        asset: "TEST",
        assetClass: "Equity",
        direction: "long" as const,
        status: "Draft",
        tradeable: true,
        conviction: 75,
        convictionRationale: "test",
        convictionIsTemplateEstimate: true,
        mispricingScore: 50,
        mispricingComponents: {
          structuralSetup: 10,
          resolutionPathShape: 10,
          convictionAlignment: 10,
          evidenceFreshness: 10,
          convictionVsSetup: 10
        },
        horizon: "test",
        advisory: "test",
        invalidation: "test",
        whyNow: "test",
        whatMarketHasntPriced: "test",
        trigger: "test",
        trade: "test",
        timeStop: "test",
        isEntryValid: true,
        showResolutionPathPercentages: true,
        resolutionPaths: {
          cleanWin: { probability: 40, whatHappens: "test", tradeImpact: "test" },
          messyWin: { probability: 35, whatHappens: "test", tradeImpact: "test" },
          thesisBroken: { probability: 25, whatHappens: "test", tradeImpact: "test" }
        },
        fourLevelCascade: {
          l1: { timeframe: "test", label: "test", description: "test" },
          l2: { timeframe: "test", label: "test", description: "test" },
          l3: { timeframe: "test", label: "test", description: "test" },
          l4: { timeframe: "test", label: "test", description: "test" }
        },
        tradePlan: {
          status: "test",
          rrCheck: "test",
          rrWarning: "test",
          entryZone: "test",
          stop: "test",
          stopColor: "red" as const,
          target1: "test",
          target2: "test",
          timeHorizon: "test",
          recommendation: "test",
          recommendationColor: "emerald" as const
        },
        insiderFlow: {
          bullInstruments: [],
          bearInstruments: [],
          confirmTags: [],
          contradictTags: []
        },
        lastUpdated: new Date().toISOString(),
        thesisId: "01abad62-7f89-43e9-810b-46c8e56154fd"
      };

      const result = thesisListItemFromEngine(
        thesis,
        false,
        null,
        mockPartition,
        mockResolvableSet, // DOES contain the thesis slug
        undefined
      );

      expect(result.detailResolvable).toBe(true);
    });

    it("should set detailResolvable to false for thesis with invalid thesisId even if slug is in set", () => {
      const thesis: EngineThesis = {
        id: "invalid-id", // Invalid thesisId
        slug: "resolvable-slug", // This IS in the resolvable set
        title: "Test thesis",
        statement: "Test statement",
        asset: "TEST",
        assetClass: "Equity",
        direction: "long" as const,
        status: "ready", // Not Draft, but invalid ID
        tradeable: true,
        conviction: 75,
        convictionRationale: "test",
        convictionIsTemplateEstimate: false,
        mispricingScore: 50,
        mispricingComponents: {
          structuralSetup: 10,
          resolutionPathShape: 10,
          convictionAlignment: 10,
          evidenceFreshness: 10,
          convictionVsSetup: 10
        },
        horizon: "test",
        advisory: "test",
        invalidation: "test",
        whyNow: "test",
        whatMarketHasntPriced: "test",
        trigger: "test",
        trade: "test",
        timeStop: "test",
        isEntryValid: true,
        showResolutionPathPercentages: true,
        resolutionPaths: {
          cleanWin: { probability: 40, whatHappens: "test", tradeImpact: "test" },
          messyWin: { probability: 35, whatHappens: "test", tradeImpact: "test" },
          thesisBroken: { probability: 25, whatHappens: "test", tradeImpact: "test" }
        },
        fourLevelCascade: {
          l1: { timeframe: "test", label: "test", description: "test" },
          l2: { timeframe: "test", label: "test", description: "test" },
          l3: { timeframe: "test", label: "test", description: "test" },
          l4: { timeframe: "test", label: "test", description: "test" }
        },
        tradePlan: {
          status: "test",
          rrCheck: "test",
          rrWarning: "test",
          entryZone: "test",
          stop: "test",
          stopColor: "red" as const,
          target1: "test",
          target2: "test",
          timeHorizon: "test",
          recommendation: "test",
          recommendationColor: "emerald" as const
        },
        insiderFlow: {
          bullInstruments: [],
          bearInstruments: [],
          confirmTags: [],
          contradictTags: []
        },
        lastUpdated: new Date().toISOString(),
        thesisId: "invalid-id"
      };

      const result = thesisListItemFromEngine(
        thesis,
        false,
        null,
        mockPartition,
        mockResolvableSet, // DOES contain the thesis slug
        undefined
      );

      expect(result.detailResolvable).toBe(false);
    });

    it("should set detailResolvable to true for valid non-Draft thesis with valid ID in set", () => {
      const thesis: EngineThesis = {
        id: "123e4567-e89b-12d3-a456-426614174000", // Valid UUID
        slug: "resolvable-slug", // This IS in the resolvable set
        title: "Test thesis",
        statement: "Test statement",
        asset: "TEST",
        assetClass: "Equity",
        direction: "long" as const,
        status: "ready", // Not Draft
        tradeable: true,
        conviction: 75,
        convictionRationale: "test",
        convictionIsTemplateEstimate: false,
        mispricingScore: 50,
        mispricingComponents: {
          structuralSetup: 10,
          resolutionPathShape: 10,
          convictionAlignment: 10,
          evidenceFreshness: 10,
          convictionVsSetup: 10
        },
        horizon: "test",
        advisory: "test",
        invalidation: "test",
        whyNow: "test",
        whatMarketHasntPriced: "test",
        trigger: "test",
        trade: "test",
        timeStop: "test",
        isEntryValid: true,
        showResolutionPathPercentages: true,
        resolutionPaths: {
          cleanWin: { probability: 40, whatHappens: "test", tradeImpact: "test" },
          messyWin: { probability: 35, whatHappens: "test", tradeImpact: "test" },
          thesisBroken: { probability: 25, whatHappens: "test", tradeImpact: "test" }
        },
        fourLevelCascade: {
          l1: { timeframe: "test", label: "test", description: "test" },
          l2: { timeframe: "test", label: "test", description: "test" },
          l3: { timeframe: "test", label: "test", description: "test" },
          l4: { timeframe: "test", label: "test", description: "test" }
        },
        tradePlan: {
          status: "test",
          rrCheck: "test",
          rrWarning: "test",
          entryZone: "test",
          stop: "test",
          stopColor: "red" as const,
          target1: "test",
          target2: "test",
          timeHorizon: "test",
          recommendation: "test",
          recommendationColor: "emerald" as const
        },
        insiderFlow: {
          bullInstruments: [],
          bearInstruments: [],
          confirmTags: [],
          contradictTags: []
        },
        lastUpdated: new Date().toISOString(),
        thesisId: "123e4567-e89b-12d3-a456-426614174000"
      };

      const result = thesisListItemFromEngine(
        thesis,
        false,
        null,
        mockPartition,
        mockResolvableSet, // DOES contain the thesis slug
        undefined
      );

      expect(result.detailResolvable).toBe(true);
    });
  });
});