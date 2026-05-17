"use client";

import { useMemo, useState } from "react";
import type { RelatedAsset, Thesis } from "@/lib/thesis-engine-v2/types";
import { buildThesisAssetEdgeRows } from "@/components/thesis-engine-v2/ThesisAssetEdgeMap";
import { buildAnatomyDebugViewModel } from "@/lib/thesis-engine-v2/thesis-anatomy-debug-heuristics";
import { cn } from "@/lib/utils";

function JsonBlock({ value }: { value: unknown }) {
  const text = value == null ? "null" : JSON.stringify(value, null, 2);
  return (
    <pre className="max-h-[420px] overflow-auto rounded border border-amber-500/15 bg-black/40 p-3 text-[10px] leading-relaxed text-zinc-300">
      {text}
    </pre>
  );
}

function BoolPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-medium",
        ok ? "bg-emerald-500/10 text-emerald-200" : "bg-rose-500/10 text-rose-200",
      )}
    >
      {label}: {ok ? "yes" : "no"}
    </span>
  );
}

export function ThesisAnatomyDebugPanel({
  thesis,
  dbBody,
  relatedAssets,
  defaultOpen = false,
}: {
  thesis: Thesis;
  dbBody: unknown | null;
  relatedAssets: RelatedAsset[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const vm = useMemo(() => {
    const assetEdgeRows = buildThesisAssetEdgeRows(thesis, relatedAssets).map((r) => ({
      symbol: r.symbol,
      biasLabel: r.biasLabel,
      mispriced: r.mispriced,
    }));
    return buildAnatomyDebugViewModel({ thesis, dbBody, assetEdgeRows });
  }, [thesis, dbBody, relatedAssets]);

  return (
    <section className="mt-10 border-t border-dashed border-amber-500/25 pt-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-500/90">
            Anatomy debug (internal)
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            Operator view — raw DB anatomy vs reconciled semantics. Not shown to end users.
          </p>
        </div>
        <span className="shrink-0 text-[11px] text-zinc-500">{open ? "Hide" : "Show"}</span>
      </button>

      {open ? (
        <div className="mt-4 space-y-6">
          <div className="rounded-lg border border-white/[0.06] bg-zinc-950/60 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Identity</p>
            <dl className="mt-2 grid gap-1 text-[11px] text-zinc-300 sm:grid-cols-2">
              <div>
                <dt className="text-zinc-600">thesis id</dt>
                <dd className="font-mono text-[10px]">{vm.identity.thesisId}</dd>
              </div>
              <div>
                <dt className="text-zinc-600">slug</dt>
                <dd>{vm.identity.slug}</dd>
              </div>
              <div>
                <dt className="text-zinc-600">primary asset</dt>
                <dd>{vm.identity.primaryAsset}</dd>
              </div>
              <div>
                <dt className="text-zinc-600">primary ticker</dt>
                <dd>{vm.identity.primaryTicker}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-zinc-600">asset_family (raw → reconciled)</dt>
                <dd>
                  {vm.identity.asset_family_raw ?? "—"} → {vm.identity.asset_family_reconciled ?? "—"}
                  {vm.identity.asset_family_changed ? (
                    <span className="ml-2 text-amber-300">changed on read</span>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-600">reconciled matches UI</dt>
                <dd>{vm.reconciled_matches_ui ? "yes" : "no"}</dd>
              </div>
            </dl>
          </div>

          {vm.smellFlags.length > 0 ? (
            <div className="rounded-lg border border-rose-500/20 bg-rose-950/20 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-300/90">Smell flags</p>
              <ul className="mt-2 list-inside list-disc text-[11px] text-rose-100/90">
                {vm.smellFlags.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                Raw — body.thesis_structured_anatomy
              </p>
              <JsonBlock value={vm.rawAnatomy} />
            </div>
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                Reconciled — applyAnatomySemantics (UI uses this)
              </p>
              <JsonBlock value={vm.reconciledAnatomy ?? vm.uiAnatomy} />
            </div>
          </div>

          {vm.fourLevel.length > 0 ? (
            <div className="space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">4-level chain</p>
              {vm.fourLevel.map((row) => (
                <div key={row.key} className="rounded-lg border border-white/[0.06] bg-zinc-900/30 p-3">
                  <p className="text-[11px] font-semibold text-zinc-200">{row.label}</p>
                  <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">{row.text || "—"}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="text-[10px] text-zinc-500">length: {row.lengthChars} chars</span>
                    {row.key !== "level1_narrative" ? (
                      <BoolPill ok={row.distinctFromL1} label="distinct from L1" />
                    ) : null}
                    <BoolPill ok={!row.containsTemplatePhrase} label="no template phrase" />
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {vm.marketEdge ? (
            <div className="rounded-lg border border-white/[0.06] bg-zinc-900/30 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Market vs edge</p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-[10px] text-zinc-600">market_is_pricing</p>
                  <p className="mt-1 text-[11px] text-zinc-300">{vm.marketEdge.market_is_pricing || "—"}</p>
                  <p className="mt-1 text-[10px] text-zinc-500">length: {vm.marketEdge.market_length}</p>
                  <div className="mt-2">
                    <BoolPill ok={vm.marketEdge.market_mentions_primary} label="mentions primary" />
                  </div>
                </div>
                <div>
                  <p className="text-[10px] text-zinc-600">depth4_edge</p>
                  <p className="mt-1 text-[11px] text-zinc-300">{vm.marketEdge.depth4_edge || "—"}</p>
                  <p className="mt-1 text-[10px] text-zinc-500">length: {vm.marketEdge.edge_length}</p>
                  <div className="mt-2">
                    <BoolPill ok={vm.marketEdge.edge_mentions_primary} label="mentions primary" />
                  </div>
                </div>
              </div>
              <div className="mt-3">
                <BoolPill ok={!vm.marketEdge.is_duplicate} label="not duplicate pair" />
              </div>
            </div>
          ) : null}

          {vm.assetMapRows.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Asset mispricing map</p>
              {vm.assetMapRows.map((row) => (
                <div key={row.symbol} className="rounded-lg border border-white/[0.06] bg-zinc-900/25 p-3">
                  <p className="text-[11px] font-semibold text-zinc-200">
                    {row.symbol} · {row.role}
                  </p>
                  <p className="mt-1 text-[10px] text-zinc-500">what_it_is_mispricing (preview)</p>
                  <p className="mt-1 text-[11px] text-zinc-400">{row.what_it_is_mispricing_preview || "—"}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <BoolPill ok={!row.contains_CL_entry_paragraph} label="no CL entry leak" />
                    <BoolPill ok={!row.contains_trade_expression_text} label="no trade-expression bleed" />
                    <BoolPill ok={row.is_asset_specific} label="asset-specific" />
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
