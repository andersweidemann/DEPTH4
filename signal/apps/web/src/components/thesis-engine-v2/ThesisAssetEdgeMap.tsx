"use client";

import { useMemo } from "react";
import type { ThesisMispricing } from "@/lib/thesis-engine-v2/mispricing";
import type { RelatedAsset, Thesis } from "@/lib/thesis-engine-v2/types";
import { MispricingAnalysis } from "@/components/thesis-engine-v2/MispricingAnalysis";

type EdgeRow = {
  symbol: string;
  biasLabel: string;
  whyLine: string;
  edgeLine: string;
};

function normalizeSym(s: string): string {
  return s.replace(/\s+/g, "").toUpperCase();
}

function biasLabelForSymbol(symbol: string, thesis: Thesis): string {
  const sym = normalizeSym(symbol);
  const hero = normalizeSym(thesis.asset === "—" ? "" : thesis.asset);
  const bulls = thesis.insiderFlow.bullInstruments.map(normalizeSym);
  const bears = thesis.insiderFlow.bearInstruments.map(normalizeSym);
  if (bulls.includes(sym)) return "Constructive flow";
  if (bears.includes(sym)) return "Defensive / hedge";
  if (hero && sym === hero) {
    if (thesis.direction === "short") return "Primary · bearish";
    if (thesis.direction === "long") return "Primary · bullish";
    return "Primary · watch";
  }
  return "Expression / read-through";
}

function buildEdgeRows(thesis: Thesis, relatedAssets: RelatedAsset[]): EdgeRow[] {
  const whyBase = (thesis.whyNow ?? "").trim() || "Connected to the thesis channel.";
  const wu = (thesis.whatsUnpriced ?? "").trim();
  const tradeExpr = (thesis.tradeExpression ?? "").trim();
  const seen = new Set<string>();
  const rows: EdgeRow[] = [];

  const add = (symbol: string, note: string, isPrimary: boolean) => {
    const s = symbol.trim();
    if (!s || s === "—" || seen.has(normalizeSym(s))) return;
    seen.add(normalizeSym(s));
    const whyLine =
      note.length > 3 && !/^primary\b/i.test(note) && !/^risk\b/i.test(note) ? note.slice(0, 220) : whyBase.slice(0, 220);
    const edgeLine =
      isPrimary && wu
        ? wu.length > 260
          ? `${wu.slice(0, 259)}…`
          : wu
        : tradeExpr
          ? tradeExpr.length > 220
            ? `${tradeExpr.slice(0, 219)}…`
            : tradeExpr
          : wu
            ? wu.slice(0, 180)
            : "See Trade plan and headline conviction paths for how to express this view.";
    rows.push({
      symbol: s,
      biasLabel: biasLabelForSymbol(s, thesis),
      whyLine,
      edgeLine,
    });
  };

  let primarySet = false;
  for (const a of relatedAssets) {
    const isPrimary = !primarySet;
    if (isPrimary) primarySet = true;
    add(a.symbol, a.note ?? "", isPrimary);
  }
  for (const s of thesis.insiderFlow.bullInstruments) {
    add(s, "Constructive insider-flow tag", false);
  }
  for (const s of thesis.insiderFlow.bearInstruments) {
    add(s, "Defensive insider-flow tag", false);
  }
  if (thesis.asset && thesis.asset !== "—" && !seen.has(normalizeSym(thesis.asset))) {
    add(thesis.asset, "Hero instrument", !primarySet);
  }

  return rows;
}

/**
 * Block B on thesis detail: explicit mispricing score + per-instrument edge framing (separate from L1–L4 scenario cascade).
 */
export function ThesisAssetEdgeMap({
  thesis,
  relatedAssets,
  mispricing,
  pathConvictionPct,
}: {
  thesis: Thesis;
  relatedAssets: RelatedAsset[];
  mispricing: ThesisMispricing;
  pathConvictionPct: number;
}) {
  const rows = useMemo(() => buildEdgeRows(thesis, relatedAssets), [thesis, relatedAssets]);

  return (
    <section
      className="rounded-lg border border-white/[0.06] bg-[#111110] p-5"
      aria-labelledby="thesis-asset-edge-heading"
    >
      <h2 id="thesis-asset-edge-heading" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
        Asset mispricing / edge map
      </h2>
      <p className="mt-1 text-[11px] leading-relaxed text-zinc-600">
        Which instruments are in play, where the tape may be wrong, and what DEPTH4 thinks is still underpriced — separate
        from the time-stacked scenario cascade above.
      </p>

      <div className="mt-4 rounded-md ring-1 ring-white/[0.05]">
        <MispricingAnalysis m={mispricing} pathConvictionPct={pathConvictionPct} />
      </div>

      <div className="mt-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-600">Key expressions</p>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {rows.map((r) => (
            <li key={r.symbol} className="rounded-md border border-white/[0.05] bg-zinc-900/35 px-3 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-mono text-[12px] font-semibold text-zinc-100">{r.symbol}</p>
                <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">{r.biasLabel}</span>
              </div>
              <p className="mt-2 text-[11px] leading-snug text-zinc-400">
                <span className="text-zinc-600">Why it matters · </span>
                {r.whyLine}
              </p>
              <p className="mt-2 text-[11px] leading-snug text-zinc-300">
                <span className="text-zinc-500">Underpriced / edge · </span>
                {r.edgeLine}
              </p>
              <p className="mt-2 text-[10px] text-zinc-600">
                Horizon · <span className="text-zinc-500">{thesis.horizon || "—"}</span>
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
