import type { Position } from "@/lib/thesis-engine-v2/types";

export type SessionBookStats = {
  openCount: number;
  closedCount: number;
  totalRealized: number;
  /** Sum of open-line unrealized when any numeric source exists; null if open rows exist but no numbers. */
  totalUnrealized: number | null;
  winRateStr: string;
  avgReturnStr: string;
  realizedStr: string;
  unrealizedStr: string;
};

function parseLooseSignedNumber(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const t = s.trim();
  if (!t || t === "—") return undefined;
  const m = t.match(/^([+-]?\d+(?:\.\d+)?)/);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : undefined;
}

function formatSignedPts(n: number | null, empty: string): string {
  if (n === null || Number.isNaN(n)) return empty;
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)} pts`;
}

/** Session Book rows only (browser positions store). */
export function computeSessionBookStats(userPositions: Position[]): SessionBookStats {
  const openRows = userPositions.filter((p) => p.tradeStatus === "open");
  const settled = userPositions.filter((p) => p.tradeStatus === "closed" || p.tradeStatus === "stopped");
  const openCount = openRows.length;
  const closedCount = settled.length;

  const withRealized = settled.filter(
    (p) => typeof p.realizedPnlNumeric === "number" && !Number.isNaN(p.realizedPnlNumeric),
  );
  const totalRealized = withRealized.reduce((s, p) => s + (p.realizedPnlNumeric ?? 0), 0);
  const wins = withRealized.filter((p) => (p.realizedPnlNumeric ?? 0) > 0).length;
  const losses = withRealized.filter((p) => (p.realizedPnlNumeric ?? 0) < 0).length;
  const denom = wins + losses;
  const winRateStr = denom === 0 ? "—" : `${Math.round((wins / denom) * 100)}%`;
  const avgReturnStr =
    withRealized.length === 0
      ? "—"
      : `${totalRealized >= 0 ? "+" : ""}${(totalRealized / withRealized.length).toFixed(2)} pts`;

  let totalUnrealized: number | null = null;
  if (openRows.length > 0) {
    let sum = 0;
    let ok = true;
    for (const p of openRows) {
      const u =
        typeof p.unrealizedPnlNumeric === "number" && !Number.isNaN(p.unrealizedPnlNumeric)
          ? p.unrealizedPnlNumeric
          : parseLooseSignedNumber(p.currentPnl);
      if (typeof u !== "number") {
        ok = false;
        break;
      }
      sum += u;
    }
    totalUnrealized = ok ? sum : null;
  }

  return {
    openCount,
    closedCount,
    totalRealized,
    totalUnrealized,
    winRateStr,
    avgReturnStr,
    realizedStr: withRealized.length === 0 ? "—" : formatSignedPts(totalRealized, "—"),
    unrealizedStr: openCount === 0 ? "—" : formatSignedPts(totalUnrealized, "—"),
  };
}
