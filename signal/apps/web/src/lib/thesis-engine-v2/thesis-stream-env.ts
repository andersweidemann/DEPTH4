declare global {
  interface Window {
    /** E2E / dev only: faster thesis mock ticks and other hooks. */
    __DEPTH4_E2E__?: { thesisTickMs?: number };
  }
}

const DEFAULT_TICK_MS = 11_000;

/** Interval for the mock thesis live stream (simulation). E2E may lower via `window.__DEPTH4_E2E__.thesisTickMs` before load. */
export function getThesisMockStreamIntervalMs(): number {
  if (typeof window === "undefined") return DEFAULT_TICK_MS;
  const n = window.__DEPTH4_E2E__?.thesisTickMs;
  if (typeof n !== "number" || !Number.isFinite(n)) return DEFAULT_TICK_MS;
  if (n < 50 || n > 120_000) return DEFAULT_TICK_MS;
  return n;
}
