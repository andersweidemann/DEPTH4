import type { InstrumentFlowSnapshot } from "./types";

function clamp(n: number, a: number, b: number) {
  return Math.min(b, Math.max(a, n));
}

function seededRand(seed: number) {
  // simple LCG (deterministic, good enough for demo)
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function mk(sym: string, r: () => number): InstrumentFlowSnapshot {
  const shock = (r() - 0.5) * 0.018; // ~ +/-0.9%
  const r1 = shock * 0.25;
  const r5 = shock * 0.6;
  const r15 = shock;
  const sigma = 0.004 + r() * 0.006; // 0.4–1.0% baseline
  const z = r15 / sigma;
  const baseVol = 1000 + r() * 2000;
  const vol = baseVol * (0.8 + r() * 0.9);
  const volMult = vol / baseVol;

  return {
    symbol: sym,
    return_1m: r1,
    return_5m: r5,
    return_15m: r15,
    volume_30m: vol,
    baseline_volume_30m: baseVol,
    volume_multiple: volMult,
    z_score: z,
  };
}

export function buildMockMarketSnapshot(nowMs: number, symbols: string[]): Record<string, InstrumentFlowSnapshot> {
  const r = seededRand(Math.floor(nowMs / 300_000)); // change every 5 minutes
  const out: Record<string, InstrumentFlowSnapshot> = {};
  for (const raw of symbols) {
    const sym = raw.trim().toUpperCase();
    if (!sym) continue;
    const snap = mk(sym, r);
    // Inject occasional stronger anomalies
    if (r() > 0.86) {
      const sign = r() > 0.5 ? 1 : -1;
      snap.return_15m = clamp(snap.return_15m + sign * (0.01 + r() * 0.02), -0.08, 0.08);
      snap.return_5m = snap.return_15m * 0.65;
      snap.return_1m = snap.return_15m * 0.25;
      snap.volume_multiple = clamp(snap.volume_multiple + 2 + r() * 4, 0.5, 9);
      snap.volume_30m = snap.baseline_volume_30m * snap.volume_multiple;
      const sigma = 0.004 + r() * 0.004;
      snap.z_score = snap.return_15m / sigma;
    }
    out[sym] = snap;
  }
  return out;
}

