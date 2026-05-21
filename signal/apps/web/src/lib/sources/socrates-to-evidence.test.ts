import { describe, expect, it } from "vitest";
import type { SocratesData } from "@/lib/sources/socrates-scraper";
import {
  parseSocratesConfidence,
  parseSocratesDirection,
  socratesEvidenceToNewsEventRow,
  socratesToEvidence,
  SOCRATES_SOURCE_LABEL,
} from "@/lib/sources/socrates-to-evidence";

const mockData: SocratesData = {
  scrapedAt: "2026-05-21T10:00:00.000Z",
  goldArrays: {
    level: "L3",
    direction: "Bullish",
    confidence: "High",
    reversalPoints: [2345.5, 2380.25],
  },
  usdArrays: {
    level: "L2",
    direction: "Bearish",
    confidence: "Medium",
    reversalPoints: [104.25, 103.8],
  },
  ecmTurnDates: [
    { date: "Jun 15, 2026", target: "general", direction: "neutral" },
    { date: "Jul 1, 2026", target: "general", direction: "bullish" },
  ],
  capitalFlows: [{ region: "North America", flow: "inflow", magnitude: "strong" }],
  majorReversals: [{ asset: "Gold", reversalPrice: 2400, type: "weekly" }],
};

describe("socratesToEvidence", () => {
  it("emits gold, usd, and ECM payloads", () => {
    const items = socratesToEvidence(mockData);
    expect(items.length).toBe(4);
    expect(items[0]?.headline).toContain("Gold Array");
    expect(items[1]?.headline).toContain("USD Array");
    expect(items[2]?.headline).toContain("ECM Turn Date");
  });

  it("inverts EURUSD direction vs USD array", () => {
    const usd = socratesToEvidence(mockData)[1];
    expect(usd?.direction).toBe("bullish");
    expect(usd?.assetSymbols).toContain("EURUSD");
  });

  it("maps news_events rows with Armstrong Socrates source label", () => {
    const item = socratesToEvidence(mockData)[0]!;
    const row = socratesEvidenceToNewsEventRow(item);
    expect(row.source).toBe(SOCRATES_SOURCE_LABEL);
    expect(row.category).toBe("socrates_technical");
    expect(row.raw_json.proprietary_technical).toBe(true);
    expect(row.source_url).toContain("2026-05-21");
  });
});

describe("parseSocratesDirection", () => {
  it("parses bullish and bearish tokens", () => {
    expect(parseSocratesDirection("Strong Bull")).toBe("bullish");
    expect(parseSocratesDirection("down trend")).toBe("bearish");
    expect(parseSocratesDirection("sideways")).toBe("neutral");
  });
});

describe("parseSocratesConfidence", () => {
  it("maps confidence strings to numeric scores", () => {
    expect(parseSocratesConfidence("High")).toBe(0.75);
    expect(parseSocratesConfidence("moderate")).toBe(0.55);
    expect(parseSocratesConfidence("weak")).toBe(0.35);
  });
});
