"use client";

import Link from "next/link";
import { useState } from "react";
import { ClosePositionModal } from "@/components/thesis-engine-v2/ClosePositionModal";
import { closeReasonLabel } from "@/lib/thesis-engine-v2/close-reason";
import { closePosition } from "@/lib/thesis-engine-v2/positions-store";
import type { Position, TradeStatus } from "@/lib/thesis-engine-v2/types";
import { StatusBadge } from "./StatusBadge";

function fmtMaybe(n?: number) {
  if (typeof n !== "number" || Number.isNaN(n)) return "—";
  return n.toString();
}

function fmtIso(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function tradeStatusTone(s: TradeStatus): string {
  if (s === "open") return "text-emerald-300 ring-emerald-500/25 bg-emerald-500/10";
  if (s === "closed" || s === "stopped") return "text-zinc-300 ring-white/[0.08] bg-zinc-900/40";
  if (s === "draft") return "text-amber-200/90 ring-amber-500/20 bg-amber-500/10";
  return "text-zinc-400 ring-white/[0.06] bg-zinc-900/30";
}

function TradeStatusBadge({ status }: { status: TradeStatus }) {
  return (
    <span
      className={`rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${tradeStatusTone(status)}`}
    >
      {status}
    </span>
  );
}

export function PositionRow({
  position,
  thesisMeta,
  manageable = false,
  onBookChange,
}: {
  position: Position;
  thesisMeta: { title: string; slug?: string };
  manageable?: boolean;
  onBookChange?: () => void;
}) {
  const [closeOpen, setCloseOpen] = useState(false);
  const thesisLink = thesisMeta.slug ? `/theses/${thesisMeta.slug}` : "/theses";
  const isOpen = position.tradeStatus === "open";
  const pnlDisplay =
    position.tradeStatus === "open"
      ? typeof position.unrealizedPnlNumeric === "number" && !Number.isNaN(position.unrealizedPnlNumeric)
        ? `${position.unrealizedPnlNumeric >= 0 ? "+" : ""}${position.unrealizedPnlNumeric.toFixed(2)}`
        : (position.currentPnl ?? "—")
      : position.realizedPnl ?? position.currentPnl ?? "—";

  return (
    <>
      <div className="grid gap-3 border-b border-white/[0.05] py-4 sm:grid-cols-[1fr_auto] sm:items-start">
        <div>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold leading-snug text-zinc-100">
                <Link href={thesisLink} className="text-amber-200/95 hover:text-amber-100">
                  {thesisMeta.title}
                </Link>
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] font-medium text-zinc-300">{position.symbol}</span>
                <span
                  className={
                    position.side === "long"
                      ? "text-[10px] font-semibold uppercase text-emerald-400"
                      : "text-[10px] font-semibold uppercase text-red-400"
                  }
                >
                  {position.side}
                </span>
                <TradeStatusBadge status={position.tradeStatus} />
              </div>
            </div>
            {manageable && isOpen ? (
              <button
                type="button"
                data-testid={`book-close-position-${position.id}`}
                className="shrink-0 rounded-md border border-white/[0.08] bg-zinc-900/50 px-3 py-2 text-[11px] font-semibold text-zinc-200 hover:bg-zinc-900/70"
                onClick={() => setCloseOpen(true)}
              >
                Close position
              </button>
            ) : null}
          </div>

          <div className="mt-3 grid gap-2 rounded-lg border border-white/[0.06] bg-zinc-900/20 px-3 py-2 text-[11px] text-zinc-500 sm:grid-cols-2">
            <div>
              <span className="text-zinc-600">Entry · </span>
              <span className="font-mono text-zinc-300">{fmtMaybe(position.entryPrice)}</span>
            </div>
            <div>
              <span className="text-zinc-600">Exit · </span>
              <span className="font-mono text-zinc-300">{fmtMaybe(position.exitPrice)}</span>
            </div>
            <div>
              <span className="text-zinc-600">Size · </span>
              <span className="font-mono text-zinc-300">{fmtMaybe(position.size)}</span>
            </div>
            <div>
              <span className="text-zinc-600">Stop / TP · </span>
              <span className="font-mono text-zinc-300">
                {fmtMaybe(position.stopLoss)} / {fmtMaybe(position.takeProfit)}
              </span>
            </div>
            <div className="sm:col-span-2">
              <span className="text-zinc-600">{position.tradeStatus === "open" ? "Unrealized PnL · " : "Realized PnL · "}</span>
              <span className="font-mono text-zinc-200">{pnlDisplay}</span>
            </div>
            {!isOpen && position.closedAt ? (
              <div className="sm:col-span-2 text-[10px] text-zinc-600">
                Closed {fmtIso(position.closedAt)}
                {position.closeReason ? ` · ${closeReasonLabel(position.closeReason)}` : null}
              </div>
            ) : null}
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-zinc-400">{position.latestUpdate}</p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <StatusBadge status={position.thesisStatus} />
          <span className="text-[10px] uppercase tracking-wider text-zinc-600">Rec · {position.recommendation}</span>
          <span className="text-sm font-semibold tabular-nums text-zinc-300">{position.probability}%</span>
        </div>
      </div>

      <ClosePositionModal
        open={closeOpen}
        onOpenChange={setCloseOpen}
        position={position}
        onClose={(input) => {
          closePosition(position.id, input);
          onBookChange?.();
        }}
      />
    </>
  );
}
