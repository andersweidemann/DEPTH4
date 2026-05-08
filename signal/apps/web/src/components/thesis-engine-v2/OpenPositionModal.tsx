"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { Position, Thesis } from "@/lib/thesis-engine-v2/types";

type FormState = {
  direction: "long" | "short";
  entryPrice: string;
  size: string;
  stopLoss: string;
  takeProfit: string;
  notes: string;
};

function numOrUndef(s: string): number | undefined {
  const t = s.trim();
  if (!t) return undefined;
  const n = Number(t);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

export function OpenPositionModal({
  open,
  onOpenChange,
  thesis,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  thesis: Thesis;
  onCreate: (p: Position) => void;
}) {
  const initial = useMemo<FormState>(
    () => ({
      direction: thesis.direction === "short" ? "short" : "long",
      entryPrice: "",
      size: "",
      stopLoss: thesis.stop ? String(thesis.stop) : "",
      takeProfit: thesis.target2 || thesis.target1 ? String(thesis.target2 || thesis.target1) : "",
      notes: "",
    }),
    [thesis.direction, thesis.stop, thesis.target1, thesis.target2],
  );

  const [form, setForm] = useState<FormState>(initial);
  const canSave = form.entryPrice.trim().length > 0 && form.size.trim().length > 0;

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((cur) => ({ ...cur, [k]: v }));
  }

  function save() {
    if (!canSave) return;
    const now = new Date();
    const id = `pos-${now.getTime().toString(36)}`;

    const p: Position = {
      id,
      symbol: thesis.asset,
      side: form.direction,
      linkedThesisId: thesis.id,
      thesisStatus: thesis.status,

      tradeStatus: "open",
      openedAt: now.toISOString(),
      entryPrice: numOrUndef(form.entryPrice),
      size: numOrUndef(form.size),
      stopLoss: numOrUndef(form.stopLoss),
      takeProfit: numOrUndef(form.takeProfit),
      notes: form.notes.trim() || undefined,
      unrealizedPnlNumeric: 0,
      currentPnl: "+0.00",

      recommendation: thesis.advisoryAction,
      probability: thesis.probability,
      latestUpdate: "Position opened (dummy). DEPTH4 will track updates against this thesis.",
    };

    onCreate(p);
    onOpenChange(false);
    setForm(initial);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[9998] bg-black/55" />
        <Dialog.Content
          className={cn(
            // NOTE: Keep this as a centered modal on all breakpoints so it’s always visibly distinct from the page.
            "fixed left-1/2 top-1/2 z-[9999] w-[92vw] max-w-xl -translate-x-1/2 -translate-y-1/2",
            "bg-[#0c0c0e] ring-1 ring-white/[0.08]",
            "focus:outline-none",
          )}
          aria-label="Open position"
          aria-describedby={undefined}
        >
          <div className="flex items-start justify-between gap-4 px-5 py-4">
            <div className="min-w-0">
              <Dialog.Title className="text-sm font-semibold text-zinc-100">Open position</Dialog.Title>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                Link a real trade to this thesis so DEPTH4 can track both the idea and your execution (dummy).
              </p>
              <p className="mt-2 text-[11px] text-zinc-400">
                <span className="font-mono">{thesis.asset}</span> · {thesis.title}
              </p>
            </div>
            <Dialog.Close
              className="flex h-11 w-11 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-900/60 hover:text-zinc-300 sm:h-9 sm:w-9"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="h-px w-full bg-white/[0.06]" aria-hidden />

          <div className="h-[calc(100dvh-132px)] overflow-y-auto px-5 py-4 sm:h-auto sm:max-h-[70vh]">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Direction</label>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => set("direction", "long")}
                    className={cn(
                      "min-h-11 rounded-md px-4 py-2.5 text-[14px] font-semibold ring-1 sm:min-h-0 sm:px-3 sm:py-2 sm:text-[11px]",
                      form.direction === "long"
                        ? "bg-emerald-500/15 text-emerald-200 ring-emerald-500/25"
                        : "bg-zinc-900/30 text-zinc-300 ring-white/[0.06] hover:bg-zinc-900/45",
                    )}
                  >
                    Long
                  </button>
                  <button
                    type="button"
                    onClick={() => set("direction", "short")}
                    className={cn(
                      "min-h-11 rounded-md px-4 py-2.5 text-[14px] font-semibold ring-1 sm:min-h-0 sm:px-3 sm:py-2 sm:text-[11px]",
                      form.direction === "short"
                        ? "bg-red-500/15 text-red-200 ring-red-500/25"
                        : "bg-zinc-900/30 text-zinc-300 ring-white/[0.06] hover:bg-zinc-900/45",
                    )}
                  >
                    Short
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
                  Entry price
                </label>
                <input
                  data-testid="open-position-entry"
                  value={form.entryPrice}
                  onChange={(e) => set("entryPrice", e.target.value)}
                  inputMode="decimal"
                  placeholder="e.g. 3290"
                  className="mt-2 w-full rounded-lg bg-zinc-900/40 px-3 py-3 text-[16px] text-zinc-200 placeholder:text-zinc-600 ring-1 ring-white/[0.06] focus:outline-none focus:ring-amber-500/20 sm:py-2 sm:text-[12px]"
                />
              </div>

              <div>
                <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
                  Position size
                </label>
                <input
                  data-testid="open-position-size"
                  value={form.size}
                  onChange={(e) => set("size", e.target.value)}
                  inputMode="decimal"
                  placeholder="e.g. 0.5"
                  className="mt-2 w-full rounded-lg bg-zinc-900/40 px-3 py-3 text-[16px] text-zinc-200 placeholder:text-zinc-600 ring-1 ring-white/[0.06] focus:outline-none focus:ring-amber-500/20 sm:py-2 sm:text-[12px]"
                />
              </div>

              <div>
                <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Stop-loss</label>
                <input
                  value={form.stopLoss}
                  onChange={(e) => set("stopLoss", e.target.value)}
                  inputMode="decimal"
                  placeholder="optional"
                  className="mt-2 w-full rounded-lg bg-zinc-900/40 px-3 py-3 text-[16px] text-zinc-200 placeholder:text-zinc-600 ring-1 ring-white/[0.06] focus:outline-none focus:ring-amber-500/20 sm:py-2 sm:text-[12px]"
                />
              </div>

              <div>
                <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Take-profit</label>
                <input
                  value={form.takeProfit}
                  onChange={(e) => set("takeProfit", e.target.value)}
                  inputMode="decimal"
                  placeholder="optional"
                  className="mt-2 w-full rounded-lg bg-zinc-900/40 px-3 py-3 text-[16px] text-zinc-200 placeholder:text-zinc-600 ring-1 ring-white/[0.06] focus:outline-none focus:ring-amber-500/20 sm:py-2 sm:text-[12px]"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Notes (optional)</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  rows={2}
                  placeholder="Why you took it, what you’re watching, etc."
                  className="mt-2 w-full resize-none rounded-lg bg-zinc-900/40 px-3 py-3 text-[16px] leading-relaxed text-zinc-200 placeholder:text-zinc-600 ring-1 ring-white/[0.06] focus:outline-none focus:ring-amber-500/20 sm:py-2 sm:text-[12px]"
                />
              </div>
            </div>
          </div>

          <div className="h-px w-full bg-white/[0.06]" aria-hidden />
          <div className="flex items-center justify-between gap-3 px-5 py-4">
            <p className="text-[11px] text-zinc-500">Creates a linked position in your Book (session-only).</p>
            <div className="flex items-center gap-2">
              <Dialog.Close className="min-h-11 rounded-md px-4 py-2.5 text-[14px] font-medium text-zinc-400 hover:bg-zinc-900/60 sm:min-h-0 sm:px-3 sm:py-2 sm:text-[11px] sm:text-zinc-500">
                Cancel
              </Dialog.Close>
              <button
                type="button"
                data-testid="open-position-save"
                disabled={!canSave}
                onClick={save}
                className={cn(
                  "min-h-11 rounded-md px-4 py-2.5 text-[14px] font-semibold sm:min-h-0 sm:px-3 sm:py-2 sm:text-[11px]",
                  canSave
                    ? "bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/25 hover:bg-amber-500/20"
                    : "bg-zinc-900/40 text-zinc-600 ring-1 ring-white/[0.06] cursor-not-allowed",
                )}
              >
                Save to Book
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

