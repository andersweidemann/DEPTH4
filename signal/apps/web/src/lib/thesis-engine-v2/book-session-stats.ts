import type { Position } from "@/lib/thesis-engine-v2/types";

export type SessionBookStats = {
  openCount: number;
  /** Full user exits only (`tradeStatus === "closed"`). Used for all closed-trade analytics. */
  closedTradeCount: number;
  totalRealized: number;
  /** Sum of open-line unrealized when every open row has a numeric mark. */
  totalUnrealized: number | null;
  winRateStr: string;
  /** Mean realized PnL per closed trade (numeric rows only). */
  avgReturnStr: string;
  realizedStr: string;
  unrealizedStr: string;
  bestClosedStr: string;
  worstClosedStr: string;
  lastClosedStr: string;
  avgHoldStr: string;
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

function parseIsoMs(iso?: string): number | undefined {
  if (!iso) return undefined;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : undefined;
}

function fmtHoldMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const h = ms / 3_600_000;
  if (h < 72) return `${h < 1 ? h.toFixed(1) : h.toFixed(0)} h`;
  const d = ms / 86_400_000;
  return `${d.toFixed(1)} d`;
}

/** Session Book rows only (browser positions store). */
export function computeSessionBookStats(userPositions: Position[]): SessionBookStats {
  const openRows = userPositions.filter((p) => p.tradeStatus === "open");
  /** Full closes only — excludes draft, cancelled, and open. */
  const fullCloses = userPositions.filter((p) => p.tradeStatus === "closed");

  const openCount = openRows.length;
  const closedTradeCount = fullCloses.length;

  const withRealized = fullCloses.filter(
    (p) => typeof p.realizedPnlNumeric === "number" && !Number.isNaN(p.realizedPnlNumeric),
  );
  const totalRealized = withRealized.reduce((s, p) => s + (p.realizedPnlNumeric ?? 0), 0);
  const decisive = withRealized.filter((p) => (p.realizedPnlNumeric ?? 0) !== 0);
  const wins = decisive.filter((p) => (p.realizedPnlNumeric ?? 0) > 0).length;
  const losses = decisive.filter((p) => (p.realizedPnlNumeric ?? 0) < 0).length;
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

  let bestClosedStr = "—";
  let worstClosedStr = "—";
  if (withRealized.length) {
    const nums = withRealized.map((p) => p.realizedPnlNumeric ?? 0);
    const best = Math.max(...nums);
    const worst = Math.min(...nums);
    bestClosedStr = formatSignedPts(best, "—");
    worstClosedStr = formatSignedPts(worst, "—");
  }

  let lastClosedStr = "—";
  const sortedLast = [...fullCloses].sort((a, b) => (b.closedAt ?? "").localeCompare(a.closedAt ?? ""));
  const last = sortedLast[0];
  if (last) {
    const r =
      typeof last.realizedPnlNumeric === "number" && !Number.isNaN(last.realizedPnlNumeric)
        ? formatSignedPts(last.realizedPnlNumeric, "—")
        : last.realizedPnl ?? "—";
    lastClosedStr = `${last.symbol} · ${r}`;
  }

  let avgHoldStr = "—";
  const holds: number[] = [];
  for (const p of fullCloses) {
    const a = parseIsoMs(p.openedAt);
    const b = parseIsoMs(p.closedAt);
    if (typeof a === "number" && typeof b === "number" && b >= a) holds.push(b - a);
  }
  if (holds.length) {
    const mean = holds.reduce((s, x) => s + x, 0) / holds.length;
    avgHoldStr = fmtHoldMs(mean);
  }

  return {
    openCount,
    closedTradeCount,
    totalRealized,
    totalUnrealized,
    winRateStr,
    avgReturnStr,
    realizedStr: withRealized.length === 0 ? "—" : formatSignedPts(totalRealized, "—"),
    unrealizedStr: openCount === 0 ? "—" : formatSignedPts(totalUnrealized, "—"),
    bestClosedStr,
    worstClosedStr,
    lastClosedStr,
    avgHoldStr,
  };
}
