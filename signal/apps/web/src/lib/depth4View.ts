import type { FeedViewModel, FeedLayer2 } from "./feed-model";

export function sourcePillClass(source: string | null | undefined): string {
  const s = (source || "Wire").toLowerCase();
  if (s.includes("reuters")) return "d4-src-reuters";
  if (s.includes("associated press") || s === "ap" || s.includes(" ap")) return "d4-src-ap";
  if (s.includes("al jazeera") || s.includes("aljazeera")) return "d4-src-alj";
  if (s.includes("bbc")) return "d4-src-bbc";
  if (s.includes("wsj") || s.includes("journal")) return "d4-src-wsj";
  return "d4-src-wsj";
}

export function relTime(publishedAt: string | null | undefined): string {
  if (!publishedAt) return "—";
  const d = new Date(publishedAt);
  if (Number.isNaN(d.getTime())) return "—";
  const diff = (Date.now() - d.getTime()) / 60000;
  if (diff < 1) return "just now";
  if (diff < 60) return `${Math.max(1, Math.floor(diff))}m ago`;
  if (diff < 60 * 24) return `${Math.floor(diff / 60)}h ago`;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export type L1FromFeed = { event: string; why: string; next: string; signal: string };

export function layer1FromView(vm: FeedViewModel): L1FromFeed {
  const ch = vm.layer2.chain;
  if (ch.length >= 3) {
    return {
      event: ch[0]!.text,
      why: ch[1]!.text,
      next: ch[2]!.text,
      signal: vm.layer2.verdict,
    };
  }
  if (ch.length === 2) {
    return {
      event: ch[0]!.text,
      why: ch[1]!.text,
      next: vm.hook,
      signal: vm.layer2.verdict,
    };
  }
  if (ch.length === 1) {
    return {
      event: vm.headline,
      why: ch[0]!.text,
      next: vm.hook,
      signal: vm.layer2.verdict,
    };
  }
  return {
    event: vm.headline,
    why: (vm.layer2 as FeedLayer2).anchorHeadline || vm.headline,
    next: vm.hook,
    signal: vm.layer2.verdict,
  };
}

function normTick(h: string): string | null {
  const m = h.match(/\b([A-Z]{1,5})\b/);
  return m ? m[1]! : null;
}

export type ClockRec = { tick: string; act: "buy" | "watch" | "avoid"; edge: number; thesis: string };

export function buildDepthClockData(vm: FeedViewModel, signalLevel: number): { urgency: number; horizon: string; recs: ClockRec[] } {
  const horizon = vm.layer2.forwardHorizonSummary?.trim() || "—";
  const urgency = Math.min(100, Math.max(8, 15 + signalLevel * 20 + (vm.affectedUserTags.length ? 12 : 0)));
  const out: ClockRec[] = [];
  const s0 = vm.layer3.scenarios[0];
  if (s0) {
    for (const t of s0.winners.slice(0, 2)) {
      out.push({
        tick: t,
        act: s0.probability > 50 ? "buy" : "watch",
        edge: Math.min(95, 50 + Math.round(s0.probability * 0.4)),
        thesis: s0.outcome.slice(0, 100) + (s0.outcome.length > 100 ? "…" : ""),
      });
    }
  }
  const sLast = vm.layer3.scenarios[vm.layer3.scenarios.length - 1];
  if (sLast && sLast !== s0) {
    for (const t of sLast.losers.slice(0, 2)) {
      out.push({
        tick: t,
        act: "avoid",
        edge: Math.max(8, 20 + Math.round((100 - sLast.probability) * 0.15)),
        thesis: sLast.outcome.slice(0, 100) + (sLast.outcome.length > 100 ? "…" : ""),
      });
    }
  }
  for (const w of vm.layer4?.watchlist || []) {
    if (out.length >= 4) break;
    const t = normTick(w.line) || w.line.split(/[·—-]/, 1)[0]?.trim().slice(0, 5);
    if (!t) continue;
    if (out.some((x) => x.tick === t)) continue;
    out.push({ tick: t, act: "watch", edge: 42, thesis: w.line.slice(0, 120) });
  }
  if (!out.length && s0) {
    out.push({
      tick: "·",
      act: "watch",
      edge: 30,
      thesis: "Scenarios are thin — use Layer 2 forward chain for timing.",
    });
  }
  return { urgency, horizon, recs: out.slice(0, 4) };
}

/** Heuristic 0–98 “edge” for sidebar. `affected` = holding overlaps active story. */
export function edgeScoreForPosition(
  ticker: string,
  _posTickers: Set<string>,
  sl: number,
  affected: boolean,
): number {
  let s = 35 + Math.min(4, Math.max(1, sl)) * 7;
  if (affected) s += 22;
  s += ((ticker.charCodeAt(0) || 0) + (ticker.length % 4)) % 7;
  return Math.min(98, s);
}
