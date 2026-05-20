import { describe, expect, it } from "vitest";
import {
  fromTwelveDataSymbol,
  isTwentyFourSevenTwelveDataSymbol,
  toTwelveDataSymbol,
} from "@/lib/market-data/symbol-mapping";

describe("symbol-mapping", () => {
  it("maps internal symbols to Twelve Data format", () => {
    expect(toTwelveDataSymbol("XAUUSD")).toBe("XAU/USD");
    expect(toTwelveDataSymbol("CL.1")).toBe("CL");
    expect(toTwelveDataSymbol("GC.1")).toBe("GC");
    expect(toTwelveDataSymbol("EURUSD")).toBe("EUR/USD");
  });

  it("passes through unmapped tickers", () => {
    expect(toTwelveDataSymbol("QQQ")).toBe("QQQ");
    expect(toTwelveDataSymbol("GLD")).toBe("GLD");
  });

  it("reverses Twelve Data symbols to internal keys", () => {
    expect(fromTwelveDataSymbol("XAU/USD")).toBe("XAUUSD");
    expect(fromTwelveDataSymbol("CL")).toBe("CL.1");
  });

  it("detects 24/7 instruments after mapping", () => {
    expect(isTwentyFourSevenTwelveDataSymbol("XAUUSD")).toBe(true);
    expect(isTwentyFourSevenTwelveDataSymbol("QQQ")).toBe(false);
  });
});
