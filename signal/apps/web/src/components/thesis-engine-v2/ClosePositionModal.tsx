"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { CLOSE_REASON_OPTIONS } from "@/lib/thesis-engine-v2/close-reason";
import type { CloseReason, Position } from "@/lib/thesis-engine-v2/types";

function numOrUndef(s: string): number | undefined {
  const t = s.trim();
  if (!t) return undefined;
  const n = Number(t);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

export function ClosePositionModal({
  open,
  onOpenChange,
  position,
  onClose,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  position: Position | null;
  onClose: (input: { exitPrice: number; realizedPnlNumeric: number; closeReason: CloseReason }) => void;
}) {
  const [exitPrice, setExitPrice] = useState("");
  const [realized, setRealized] = useState("");
  const [reason, setReason] = useState<CloseReason>("manual_exit");

  const thesisLabel = position?.symbol ?? "";

  const canSave = useMemo(() => {
    const ex = numOrUndef(exitPrice);
    const pnl = numOrUndef(realized);
    return typeof ex === "number" && typeof pnl === "number";
  }, [exitPrice, realized]);

  function reset() {
    setExitPrice("");
    setRealized("");
    setReason("manual_exit");
  }

  function save() {
    if (!position || !canSave) return;
    const ex = numOrUndef(exitPrice)!;
    const pnl = numOrUndef(realized)!;
    onClose({ exitPrice: ex, realizedPnlNumeric: pnl, closeReason: reason });
    onOpenChange(false);
    reset();
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[240] bg-black/55" />
        <Dialog.Content
          className={cn(
            "fixed inset-0 z-[241] w-full bg-[#0c0c0e] shadow-2xl",
            "sm:left-1/2 sm:top-1/2 sm:inset-auto sm:w-[92vw] sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:border sm:border-white/[0.08]",
            "focus:outline-none",
          )}
          aria-describedby={undefined}
        >
          <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-5 py-4">
            <div className="min-w-0">
              <Dialog.Title className="text-sm font-semibold text-zinc-100">Close position</Dialog.Title>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                Full close (dummy). Captures exit, timestamp, realized PnL, and why you exited — framed for your thesis
                review.
              </p>
              {position ? (
                <p className="mt-2 font-mono text-[11px] text-zinc-400">
                  {thesisLabel} · {position.side.toUpperCase()}
                </p>
              ) : null}
            </div>
            <Dialog.Close
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-900/60 hover:text-zinc-300 sm:h-9 sm:w-9"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="max-h-[min(70dvh,28rem)] overflow-y-auto px-5 py-4 sm:max-h-none">
            <div className="grid gap-4">
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Exit price</label>
                <input
                  data-testid="close-position-exit"
                  value={exitPrice}
                  onChange={(e) => setExitPrice(e.target.value)}
                  inputMode="decimal"
                  placeholder="e.g. 3275"
                  className="mt-2 w-full rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-3 text-[16px] text-zinc-200 placeholder:text-zinc-600 sm:py-2 sm:text-[12px]"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
                  Realized PnL (dummy points)
                </label>
                <input
                  data-testid="close-position-realized"
                  value={realized}
                  onChange={(e) => setRealized(e.target.value)}
                  inputMode="decimal"
                  placeholder="e.g. 1.2 or -0.4"
                  className="mt-2 w-full rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-3 text-[16px] text-zinc-200 placeholder:text-zinc-600 sm:py-2 sm:text-[12px]"
                />
                <p className="mt-1 text-[10px] text-zinc-600">Signed number; used for win rate and averages in Book.</p>
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Close reason</label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value as CloseReason)}
                  className="mt-2 w-full rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-3 text-[14px] text-zinc-200 sm:py-2 sm:text-[12px]"
                >
                  {CLOSE_REASON_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/[0.06] px-5 py-4">
            <Dialog.Close className="min-h-11 rounded-md px-4 py-2.5 text-[14px] font-medium text-zinc-400 hover:bg-zinc-900/60 sm:min-h-0 sm:px-3 sm:py-2 sm:text-[11px] sm:text-zinc-500">
              Cancel
            </Dialog.Close>
            <button
              type="button"
              data-testid="close-position-save"
              disabled={!canSave}
              onClick={save}
              className={cn(
                "min-h-11 rounded-md px-4 py-2.5 text-[14px] font-semibold sm:min-h-0 sm:px-3 sm:py-2 sm:text-[11px]",
                canSave
                  ? "bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/25 hover:bg-amber-500/20"
                  : "cursor-not-allowed bg-zinc-900/40 text-zinc-600 ring-1 ring-white/[0.06]",
              )}
            >
              Close & save to Book
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
