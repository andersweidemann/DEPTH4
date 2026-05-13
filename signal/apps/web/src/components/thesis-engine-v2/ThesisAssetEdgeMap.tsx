"use client";

import { useMemo } from "react";
import type { RelatedAsset, Thesis } from "@/lib/thesis-engine-v2/types";

type EdgeRow = {
  symbol: string;
  headline: string;
  biasLabel: string;
  whyItMatters: string;
  consensus: string;
  mispriced: string;
  edgeWindow: string;
  depth: string;
};

function normalizeSym(s: string): string {
  return s.replace(/\s+/g, "").toUpperCase();
}

function biasLabelForSymbol(symbol: string, thesis: Thesis): string {
  const sym = normalizeSym(symbol);
  const hero = normalizeSym(thesis.asset === "—" ? "" : thesis.asset);
  const flow = thesis.insiderFlow;
  const bulls = (flow?.bullInstruments ?? []).map(normalizeSym);
  const bears = (flow?.bearInstruments ?? []).map(normalizeSym);
  if (bulls.includes(sym)) return "Constructive flow";
  if (bears.includes(sym)) return "Defensive / hedge";
  if (hero && sym === hero) {
    if (thesis.direction === "short") return "Primary · bearish";
    if (thesis.direction === "long") return "Primary · bullish";
    return "Primary · watch";
  }
  return "Expression / read-through";
}

function isStructuredAsset(a: RelatedAsset): boolean {
  return !!(a.whyItMatters?.trim() || a.whatAssetMisprices?.trim() || a.consensusOnAsset?.trim());
}

/** Pure row builder — exported for catalog / regression tests. */
export function buildThesisAssetEdgeRows(thesis: Thesis, relatedAssets: RelatedAsset[]): EdgeRow[] {
  const whyBase = (thesis.whyNow ?? "").trim() || "Connected to the thesis channel.";
  const wu = (thesis.whatsUnpriced ?? "").trim();
  const tradeExpr = (thesis.tradeExpression ?? "").trim();
  const seen = new Set<string>();
  const rows: EdgeRow[] = [];

  const pushRow = (r: EdgeRow) => {
    const k = normalizeSym(r.symbol);
    if (!k || k === "—") return;
    if (k === "COPPER") return;
    if (seen.has(k)) return;
    seen.add(k);
    rows.push(r);
  };

  let legacyPrimaryDone = false;
  for (const a of relatedAssets) {
    if (isStructuredAsset(a)) {
      pushRow({
        symbol: a.symbol,
        headline: (a.displayName ?? a.symbol).trim(),
        biasLabel: (a.directionBias ?? biasLabelForSymbol(a.symbol, thesis)).trim(),
        whyItMatters: (a.whyItMatters ?? a.note ?? whyBase).trim(),
        consensus: (a.consensusOnAsset ?? "—").trim() || "—",
        mispriced: (a.whatAssetMisprices ?? "—").trim() || "—",
        edgeWindow: (a.edgeWindow ?? thesis.horizon ?? "—").trim() || "—",
        depth: (a.depthConfidence ?? "—").trim() || "—",
      });
      continue;
    }

    const isPrimary = !legacyPrimaryDone;
    if (isPrimary) legacyPrimaryDone = true;
    const mispriced =
      isPrimary && wu
        ? wu.length > 280
          ? `${wu.slice(0, 279)}…`
          : wu
        : tradeExpr
          ? tradeExpr.length > 220
            ? `${tradeExpr.slice(0, 219)}…`
            : tradeExpr
          : wu
            ? wu.slice(0, 180)
            : "See Trade plan for how this symbol expresses the thesis.";
    const note = (a.note ?? "").trim();
    pushRow({
      symbol: a.symbol,
      headline: a.symbol,
      biasLabel: biasLabelForSymbol(a.symbol, thesis),
      whyItMatters:
        note.length > 3 && !/^primary\b/i.test(note) ? note.slice(0, 240) : whyBase.slice(0, 240),
      consensus: "See thesis-level conviction paths above.",
      mispriced,
      edgeWindow: thesis.horizon || "—",
      depth: "—",
    });
  }

  const flow = thesis.insiderFlow;
  const bullList = flow?.bullInstruments ?? [];
  const bearList = flow?.bearInstruments ?? [];
  for (const s of bullList) {
    if (normalizeSym(s) === "COPPER") continue;
    if (seen.has(normalizeSym(s))) continue;
    pushRow({
      symbol: s,
      headline: s,
      biasLabel: biasLabelForSymbol(s, thesis),
      whyItMatters: "Tagged as constructive insider-flow confirmation for this thesis.",
      consensus: "—",
      mispriced: tradeExpr ? tradeExpr.slice(0, 200) : wu.slice(0, 160) || "—",
      edgeWindow: thesis.horizon || "—",
      depth: "—",
    });
  }
  for (const s of bearList) {
    if (normalizeSym(s) === "COPPER") continue;
    if (seen.has(normalizeSym(s))) continue;
    pushRow({
      symbol: s,
      headline: s,
      biasLabel: biasLabelForSymbol(s, thesis),
      whyItMatters: "Tagged as defensive / hedge flow relative to this thesis.",
      consensus: "—",
      mispriced: tradeExpr ? tradeExpr.slice(0, 200) : "—",
      edgeWindow: thesis.horizon || "—",
      depth: "—",
    });
  }
  if (thesis.asset && thesis.asset !== "—" && !seen.has(normalizeSym(thesis.asset))) {
    pushRow({
      symbol: thesis.asset,
      headline: thesis.asset,
      biasLabel: biasLabelForSymbol(thesis.asset, thesis),
      whyItMatters: "Hero instrument for this thesis book.",
      consensus: "—",
      mispriced: wu || tradeExpr || "—",
      edgeWindow: thesis.horizon || "—",
      depth: "—",
    });
  }

  return rows;
}

/**
 * Block B: per-instrument edge (consensus vs DEPTH4) — macro timeline stays in the scenario cascade above.
 * Mispricing score is shown once in the hero; this block references it without repeating the numeric breakdown.
 */
export function ThesisAssetEdgeMap({ thesis, relatedAssets }: { thesis: Thesis; relatedAssets: RelatedAsset[] }) {
  const rows = useMemo(() => buildThesisAssetEdgeRows(thesis, relatedAssets), [thesis, relatedAssets]);

  return (
    <section
      className="rounded-lg border border-white/[0.06] bg-[#111110] p-5"
      aria-labelledby="thesis-asset-edge-heading"
    >
      <h2 id="thesis-asset-edge-heading" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
        Asset mispricing / edge map
      </h2>
      <p className="mt-1 text-[11px] leading-relaxed text-zinc-600">
        The headline mispricing score above blends path conviction with setup clarity. Below, the same thesis is split
        across instruments — each row is asset-specific (not a repeat of the L1–L4 macro timeline).
      </p>

      <div className="mt-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-600">Key expressions</p>
        <ul className="mt-3 grid gap-4 lg:grid-cols-2">
          {rows.map((r) => (
            <li key={r.symbol} className="rounded-md border border-white/[0.05] bg-zinc-900/35 px-3 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[12px] font-semibold text-zinc-100">{r.headline}</p>
                <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">{r.biasLabel}</span>
              </div>
              <p className="mt-2 font-mono text-[10px] text-zinc-600">{r.symbol}</p>
              <p className="mt-2 text-[11px] leading-snug text-zinc-300">
                <span className="font-medium text-zinc-500">Why it matters · </span>
                {r.whyItMatters}
              </p>
              <p className="mt-2 text-[11px] leading-snug text-zinc-400">
                <span className="font-medium text-zinc-500">Consensus on this asset · </span>
                {r.consensus}
              </p>
              <p className="mt-2 text-[11px] leading-snug text-zinc-200">
                <span className="font-medium text-zinc-500">What it&apos;s mispricing · </span>
                {r.mispriced}
              </p>
              <p className="mt-2 text-[10px] text-zinc-600">
                <span className="text-zinc-500">Edge window · </span>
                {r.edgeWindow}
              </p>
              <p className="mt-1 text-[10px] text-zinc-600">
                <span className="text-zinc-500">Depth / confidence · </span>
                {r.depth}
              </p>
            </li>
          ))}
        </ul>
        {rows.length === 0 ? (
          <p className="mt-2 text-[11px] text-zinc-600">No linked instruments yet — refine the thesis book to tag expressions.</p>
        ) : null}
      </div>
    </section>
  );
}
