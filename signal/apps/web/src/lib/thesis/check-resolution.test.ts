import { describe, expect, it } from "vitest";
import { daysSince, parseHorizonDays, parsePriceLevel, resolveQuoteSymbol } from "@/lib/thesis/check-resolution";

describe("check-resolution helpers", () => {
  it("maps symbols for Twelve Data", () => {
    expect(resolveQuoteSymbol("XAUUSD")).toBe("XAU/USD");
    expect(resolveQuoteSymbol("CL.1")).toBe("CL");
    expect(resolveQuoteSymbol("GLD")).toBe("GLD");
  });

  it("parses price strings", () => {
    expect(parsePriceLevel("$2,480.50")).toBe(2480.5);
  });

  it("parses horizon to days", () => {
    expect(parseHorizonDays("Days to weeks")).toBeGreaterThan(0);
    expect(parseHorizonDays("2–8 weeks")).toBe(7);
  });

  it("computes days since", () => {
    const d = new Date(Date.now() - 3 * 86_400_000).toISOString();
    expect(daysSince(d)).toBe(3);
  });
});
