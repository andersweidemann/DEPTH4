import { describe, expect, it } from "vitest";
import { averageTrueRange, computeLiveTradePlan, mapAssetToQuoteSymbol } from "./live-trade-plan";
import type { OhlcvBar } from "@/lib/market-data";

function synthBars(spot: number, atrHint: number, n = 20): OhlcvBar[] {
  const out: OhlcvBar[] = [];
  let px = spot - atrHint * 8;
  const ts0 = Date.UTC(2026, 0, 1);
  for (let i = 0; i < n; i++) {
    px += atrHint * (i % 3 === 0 ? 1.1 : -0.35);
    const hi = px + atrHint * 0.6;
    const lo = px - atrHint * 0.6;
    out.push({
      tsMs: ts0 + i * 86_400_000,
      open: px,
      high: hi,
      low: lo,
      close: px,
      volume: 1e6,
    });
  }
  out[out.length - 1]!.close = spot;
  out[out.length - 1]!.high = Math.max(out[out.length - 1]!.high, spot);
  out[out.length - 1]!.low = Math.min(out[out.length - 1]!.low, spot);
  return out;
}

describe("live-trade-plan", () => {
  it("maps catalog assets to quote symbols", () => {
    expect(mapAssetToQuoteSymbol("XAUUSD")).toBe("XAU/USD");
    expect(mapAssetToQuoteSymbol("USOIL")).toBe("WTI");
    expect(mapAssetToQuoteSymbol("QQQ")).toBe("QQQ");
  });

  it("computes positive ATR on swingy series", () => {
    const bars = synthBars(100, 2, 22);
    expect(averageTrueRange(bars, 14)).toBeGreaterThan(0);
  });

  it("long ready plan places stop below targets above", () => {
    const bars = synthBars(200, 4, 22);
    const { trade_plan: p } = computeLiveTradePlan({
      bars,
      direction: "long",
      status: "ready",
      quoteSymbol: "TEST",
    });
    expect(p.ready).toBe(true);
    expect(p.stop).not.toBeNull();
    expect(p.target1).not.toBeNull();
    expect(p.target2).not.toBeNull();
    expect(p.stop!).toBeLessThan(200);
    expect(p.target1!).toBeGreaterThan(200);
    expect(p.target2!).toBeGreaterThan(p.target1!);
    expect(p.entry_zone.min).not.toBeNull();
    expect(p.entry_zone.max).not.toBeNull();
  });

  it("short ready plan places stop above targets below", () => {
    const bars = synthBars(200, 4, 22);
    const { trade_plan: p } = computeLiveTradePlan({
      bars,
      direction: "short",
      status: "active",
      quoteSymbol: "TEST",
    });
    expect(p.ready).toBe(true);
    expect(p.stop!).toBeGreaterThan(200);
    expect(p.target1!).toBeLessThan(200);
    expect(p.target2!).toBeLessThan(p.target1!);
  });

  it("watch direction never marks ready", () => {
    const bars = synthBars(200, 4, 22);
    const { trade_plan: p } = computeLiveTradePlan({
      bars,
      direction: "watch",
      status: "ready",
      quoteSymbol: "TEST",
    });
    expect(p.ready).toBe(false);
  });
});
