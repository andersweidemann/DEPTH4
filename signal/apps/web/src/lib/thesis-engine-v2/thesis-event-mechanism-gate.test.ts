import { describe, expect, it } from "vitest";
import {
  evaluateThesisEventMechanismGate,
  inferThesisAssetFamily,
  isMechanismGateStopListTag,
} from "@/lib/thesis-engine-v2/thesis-event-mechanism-gate";

function gateFixture(args: {
  thesisTitle: string;
  bull?: string[];
  bear?: string[];
  confirmTags?: string[];
  contradictTags?: string[];
  headline: string;
  category?: string | null;
  body?: string;
  tickers?: string[];
  signalLevel?: number;
  confirmMatched?: string[];
  contradictMatched?: string[];
}) {
  const confirmTags = args.confirmTags ?? [];
  const contradictTags = args.contradictTags ?? [];
  const matchText = [args.headline, args.body ?? "", args.category ? `Category: ${args.category}` : ""]
    .filter(Boolean)
    .join("\n");

  const confirmMatched =
    args.confirmMatched ??
    confirmTags.filter((t) => matchText.toLowerCase().includes(t.toLowerCase()));
  const contradictMatched =
    args.contradictMatched ??
    contradictTags.filter((t) => matchText.toLowerCase().includes(t.toLowerCase()));
  const tickerHits = args.tickers ?? [];

  return evaluateThesisEventMechanismGate({
    thesis: {
      title: args.thesisTitle,
      bullInstruments: args.bull ?? [],
      bearInstruments: args.bear ?? ["TLT"],
    },
    event: {
      headline: args.headline,
      category: args.category ?? null,
      region: null,
      bodyText: args.body ?? null,
    },
    match: {
      matchText,
      confirmMatched,
      contradictMatched,
      tickerHits,
      signalLevel: args.signalLevel ?? 4,
    },
  });
}

describe("thesis-event-mechanism-gate (Phase 3A)", () => {
  it("flags broad stop-list tags", () => {
    expect(isMechanismGateStopListTag("news")).toBe(true);
    expect(isMechanismGateStopListTag("fed")).toBe(false);
  });

  it("infers asset families from instruments and title", () => {
    expect(
      inferThesisAssetFamily({
        title: "Fed pivot delayed — TLT weakness",
        bullInstruments: [],
        bearInstruments: ["TLT"],
      }),
    ).toBe("rates");
    expect(
      inferThesisAssetFamily({
        title: "Strait risk keeps crude bid",
        bullInstruments: ["WTI"],
        bearInstruments: [],
      }),
    ).toBe("oil");
  });

  describe("blocked weak links", () => {
    it("blocks Eurovision entertainment → rates via news tag only", () => {
      const g = gateFixture({
        thesisTitle: "Fed pivot delayed — TLT weakness",
        bear: ["TLT", "IEF"],
        confirmTags: ["news", "fed", "cpi", "rates"],
        headline: "Eurovision 2026 grand final lineup announced in Malmö",
        category: "entertainment",
        body: "Hosts reveal running order for Saturday's song contest final.",
        confirmMatched: ["news"],
      });
      expect(g.allowed).toBe(false);
      expect(g.logOnly).toBe(true);
      expect(g.blockCode).toBe("category_mismatch");
    });

    it("blocks festival culture → META via event tag only", () => {
      const g = gateFixture({
        thesisTitle: "EU tech fines keep META under pressure",
        bear: ["META"],
        confirmTags: ["event", "european commission", "dma"],
        headline: "Local festival draws record crowd downtown",
        category: "culture",
        body: "Summer street festival breaks attendance record",
        confirmMatched: ["event"],
      });
      expect(g.allowed).toBe(false);
      expect(g.logOnly).toBe(true);
      expect(["broad_tag_only", "category_mismatch"]).toContain(g.blockCode);
    });

    it("blocks generic markets roundup with only news tag", () => {
      const g = gateFixture({
        thesisTitle: "Fed pivot delayed — TLT weakness",
        bear: ["TLT"],
        confirmTags: ["news", "macro"],
        headline: "Markets wrap: stocks mixed, bonds steady",
        category: "markets",
        body: "A quiet session across asset classes with no major data.",
        confirmMatched: ["news"],
      });
      expect(g.allowed).toBe(false);
      expect(g.blockCode).toBe("broad_tag_only");
    });

    it("blocks ticker-only WTI mention without supply/demand mechanism", () => {
      const g = evaluateThesisEventMechanismGate({
        thesis: {
          title: "Strait risk keeps crude bid",
          bullInstruments: ["USOIL", "WTI"],
          bearInstruments: [],
        },
        event: {
          headline: "WTI futures tick higher in thin afternoon trade",
          category: "markets",
          region: "global",
          bodyText: "Crude edges up 0.3%",
        },
        match: {
          matchText: "WTI futures tick higher in thin afternoon trade\nCategory: markets\nCrude edges up 0.3%",
          confirmMatched: [],
          contradictMatched: [],
          tickerHits: ["WTI"],
          signalLevel: 4,
        },
      });
      expect(g.allowed).toBe(false);
      expect(g.blockCode).toBe("ticker_only");
      expect(g.logOnly).toBe(true);
    });
  });

  describe("allowed high-mechanism events", () => {
    it("allows CPI / Fed path for rates thesis", () => {
      const g = gateFixture({
        thesisTitle: "Fed pivot delayed — TLT weakness",
        bear: ["TLT"],
        confirmTags: ["news", "fed", "cpi"],
        headline: "US CPI comes in hot; Fed speakers push back on early cuts",
        category: "macro data",
        body: "Core CPI holds above 3% and FOMC members cite sticky inflation.",
        confirmMatched: ["cpi", "fed"],
      });
      expect(g.allowed).toBe(true);
      expect(g.mechanismReason).toMatch(/inflation|Fed/i);
    });

    it("allows ticker plus chokepoint mechanism without tag overlap", () => {
      const g = evaluateThesisEventMechanismGate({
        thesis: {
          title: "Strait risk keeps crude bid",
          bullInstruments: ["WTI"],
          bearInstruments: [],
        },
        event: {
          headline: "Insurers pull cover on Hormuz transits after incident",
          category: "geopolitics energy",
          region: "middle east",
          bodyText: "Tanker risk premia spike; WTI mentioned in futures basket.",
        },
        match: {
          matchText:
            "Insurers pull cover on Hormuz transits after incident\nCategory: geopolitics energy\nTanker risk premia spike",
          confirmMatched: [],
          contradictMatched: [],
          tickerHits: ["WTI"],
          signalLevel: 4,
        },
      });
      expect(g.allowed).toBe(true);
      expect(g.mechanismSignals.some((s) => s.startsWith("keyword:"))).toBe(true);
    });

    it("allows OPEC supply signal for oil thesis", () => {
      const g = gateFixture({
        thesisTitle: "Strait risk keeps crude bid",
        bull: ["WTI"],
        bear: [],
        confirmTags: ["opec", "hormuz"],
        headline: "OPEC+ agrees deeper production cut through Q3",
        category: "energy",
        body: "Ministers cite thin spare capacity and firm demand.",
        confirmMatched: ["opec"],
      });
      expect(g.allowed).toBe(true);
      expect(g.mechanismReason).toMatch(/OPEC|supply/i);
    });

    it("allows crypto ETF/regulation path", () => {
      const g = gateFixture({
        thesisTitle: "BTC institutional adoption accelerates",
        bull: ["BTC"],
        bear: [],
        confirmTags: ["etf", "regulation"],
        headline: "Spot BTC ETF sees largest weekly inflow since launch",
        category: "crypto",
        body: "SEC staff comments ease custody concerns for advisers.",
        confirmMatched: ["etf"],
      });
      expect(g.allowed).toBe(true);
      expect(g.assetFamily).toBe("crypto");
    });

    it("allows defense budget / procurement", () => {
      const g = gateFixture({
        thesisTitle: "NATO rearmament lifts defense primes",
        bull: ["LMT", "RTX"],
        bear: [],
        confirmTags: ["defense budget", "procurement"],
        headline: "Pentagon awards $4.2B missile contract to major primes",
        category: "defense",
        body: "Congressional defense budget markup adds procurement headroom.",
        confirmMatched: ["procurement"],
      });
      expect(g.allowed).toBe(true);
      expect(g.assetFamily).toBe("defense");
    });

    it("allows earnings/regulation for equity thesis", () => {
      const g = gateFixture({
        thesisTitle: "EU tech fines keep META under pressure",
        bear: ["META"],
        confirmTags: ["dma", "antitrust"],
        headline: "EU Commission fines META over DMA ad-targeting breach",
        category: "antitrust",
        body: "Regulators cite recurring compliance failures.",
        confirmMatched: ["dma"],
      });
      expect(g.allowed).toBe(true);
      expect(g.mechanismReason).toMatch(/regulatory|DMA|antitrust/i);
    });

    it("allows Treasury auction miss for rates", () => {
      const g = gateFixture({
        thesisTitle: "Term premium rebuild weighs on TLT",
        bear: ["TLT"],
        confirmTags: ["treasury", "auction"],
        headline: "30-year Treasury auction tails; long-end yields jump",
        category: "treasury",
        body: "Weak demand at the long bond auction lifts term premium.",
        confirmMatched: ["treasury"],
      });
      expect(g.allowed).toBe(true);
      expect(g.mechanismReason).toMatch(/Treasury|term premium|yield/i);
    });
  });

  describe("log-only semantics", () => {
    it("returns logOnly without movement for blocked confirm_tag match", () => {
      const g = gateFixture({
        thesisTitle: "Fed pivot delayed — TLT weakness",
        bear: ["TLT"],
        confirmTags: ["news"],
        headline: "Eurovision hosts reveal final running order",
        category: "entertainment",
        confirmMatched: ["news"],
      });
      expect(g.allowed).toBe(false);
      expect(g.logOnly).toBe(true);
      expect(g.mechanismReason).toBeNull();
    });
  });
});
