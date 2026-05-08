import type { InsiderFlowAnomaly, InsiderFlowDetectionInput, InsiderFlowPatternType, InstrumentFlowSnapshot } from "./types";

function newId(prefix: string, nowMs: number) {
  return `${prefix}-${nowMs.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normSym(s: string) {
  return s.trim().toUpperCase();
}

function matchesAnyTag(headline: string, tags: string[]) {
  const h = headline.toLowerCase();
  return tags.some((t) => t.trim() && h.includes(t.trim().toLowerCase()));
}

function isFlowAnomaly(x: InstrumentFlowSnapshot): boolean {
  return Math.abs(x.z_score) >= 1.5 && x.volume_multiple >= 3;
}

function alignmentScore(symbol: string, snap: InstrumentFlowSnapshot, bull: Set<string>, bear: Set<string>) {
  // Direction convention (MVP):
  // - Bull leak = bull instruments up OR bear instruments down
  // - Bear leak = bear instruments up OR bull instruments down
  // We treat return_15m sign as direction proxy.
  const r = snap.return_15m;
  const s = normSym(symbol);

  const bullAligned = (bull.has(s) && r > 0) || (bear.has(s) && r < 0);
  const bearAligned = (bear.has(s) && r > 0) || (bull.has(s) && r < 0);

  return { bullAligned, bearAligned };
}

export function detectInsiderFlowAnomaly(input: InsiderFlowDetectionInput): InsiderFlowAnomaly | null {
  const bull = new Set(input.bullInstruments.map(normSym).filter(Boolean));
  const bear = new Set(input.bearInstruments.map(normSym).filter(Boolean));
  const symbols = Array.from(new Set([...Array.from(bull), ...Array.from(bear)]));
  if (!symbols.length) return null;

  const snaps: InstrumentFlowSnapshot[] = [];
  for (const sym of symbols) {
    const s = input.market[normSym(sym)];
    if (!s) continue;
    if (!isFlowAnomaly(s)) continue;
    snaps.push(s);
  }
  if (!snaps.length) return null;

  // Determine pattern by alignment votes.
  let bullVotes = 0;
  let bearVotes = 0;
  for (const s of snaps) {
    const a = alignmentScore(s.symbol, s, bull, bear);
    if (a.bullAligned) bullVotes += 1;
    if (a.bearAligned) bearVotes += 1;
  }

  const patternType: InsiderFlowPatternType =
    bullVotes === bearVotes ? (snaps[0]!.return_15m >= 0 ? "BULL_LEAK" : "BEAR_LEAK") : bullVotes > bearVotes ? "BULL_LEAK" : "BEAR_LEAK";

  // Headline confirm check (last 30m, caller supplies already windowed list)
  const matched = input.confirmTags.filter((t) => t.trim()).filter((t) => input.recentHeadlines.some((h) => matchesAnyTag(h.headline, [t])));

  const status = matched.length ? "CONFIRMED_MOVE" : "UNCONFIRMED_LEAK";

  const zMax = snaps.reduce((m, s) => Math.max(m, Math.abs(s.z_score)), 0);
  const volMax = snaps.reduce((m, s) => Math.max(m, s.volume_multiple), 0);
  const notes =
    status === "UNCONFIRMED_LEAK"
      ? "Tape is moving as if this thesis is leaking. No matching public headline yet."
      : "Move matches confirm tags in the public feed.";

  return {
    id: newId("if", input.nowMs),
    createdAt: input.nowMs,
    thesisId: input.thesisId,
    thesisTitle: input.thesisTitle,
    patternType,
    status,
    instrumentsMoved: snaps,
    matchedTags: matched,
    confirmedHeadlineAt: status === "CONFIRMED_MOVE" ? input.nowMs : undefined,
    notes: `${notes} z≈${zMax.toFixed(2)}, vol≈${volMax.toFixed(1)}x.`,
  };
}

