"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { Thesis } from "@/lib/thesis-engine-v2/types";

type FormState = {
  title: string;
  thesisStatement: string;
  asset: string;
  marketMisread: string;
  trigger: string;
  invalidation: string;
  horizon: string;
  probability: string; // percent string
  entry: string;
  stop: string;
  target: string;
};

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 72);
}

function clamp(n: number, a: number, b: number) {
  return Math.min(b, Math.max(a, n));
}

function scoreFromProb(p: number) {
  // Heuristic for dummy: higher conviction tends to imply stronger driver + clearer trade.
  const driverStrength = clamp(Math.round((p / 100) * 18), 6, 20);
  const timeCompression = clamp(Math.round((p / 100) * 22), 6, 25);
  const marketMispricingScore = clamp(Math.round((p / 100) * 22), 6, 25);
  const tradeClarityScore = clamp(Math.round((p / 100) * 14), 4, 15);
  const triggerClarityScore = clamp(Math.round((p / 100) * 14), 4, 15);
  const total = clamp(
    driverStrength + timeCompression + marketMispricingScore + tradeClarityScore + triggerClarityScore,
    0,
    100,
  );
  const qualification = total >= 65 ? "tradeable" : total >= 40 ? "emerging" : "theme";
  return { driverStrength, timeCompression, marketMispricingScore, tradeClarityScore, triggerClarityScore, total, qualification } as const;
}

function buildUserThesis(form: FormState): Thesis {
  const p = clamp(Number.parseInt(form.probability || "0", 10) || 0, 0, 100);
  const s = scoreFromProb(p);
  const title = form.title.trim();
  const baseSlug = slugify(title || "user-thesis");
  const nowId = `user-${Date.now().toString(36)}`;
  const asset = form.asset.trim().toUpperCase();

  const tradeLine = form.entry || form.stop || form.target
    ? `Entry ${form.entry || "—"} · Stop ${form.stop || "—"} · Target ${form.target || "—"}`
    : "Optional setup pending — define entry/stop/targets when trigger compresses.";

  return {
    id: nowId,
    slug: `${baseSlug}-${nowId.slice(-4)}`,
    title: title || "Untitled thesis",
    thesisStatement: form.thesisStatement.trim(),
    asset: asset || "—",
    direction: "watch",
    probability: p || 50,
    status: p >= 65 ? "actionable" : p >= 50 ? "active" : "watching",
    probabilityRationale:
      "Starting conviction reflects your framing. DEPTH4 will update probability as signals confirm or break the trigger.",
    origin: "user",

    hiddenDriver: "User thesis — driver defined by your framing; DEPTH4 will infer supporting drivers from incoming signals.",
    likelyPath: "Signals accumulate → trigger clarity improves → the market catches up → the trade resolves into targets or invalidation.",
    marketMisread: form.marketMisread.trim(),
    tradeExpression: `Cleanest expression: ${asset || "asset"} — ${tradeLine}`,

    whyNow: "You flagged an idea with a tradeable horizon — DEPTH4 begins monitoring immediately.",
    whatsUnpriced: form.marketMisread.trim(),
    trigger: form.trigger.trim(),
    trade: tradeLine,
    invalidation: form.invalidation.trim(),
    horizon: form.horizon.trim(),
    advisoryAction: p >= 65 ? "enter" : p >= 50 ? "hold" : "watch",
    lastUpdated: "Just now",

    qualification: s.qualification,
    scores: {
      driverStrength: s.driverStrength,
      timeCompression: s.timeCompression,
      marketMispricingScore: s.marketMispricingScore,
      tradeClarityScore: s.tradeClarityScore,
      triggerClarityScore: s.triggerClarityScore,
      total: s.total,
    },
    theme: "user",

    entryZone: form.entry.trim() || undefined,
    stop: form.stop.trim() || undefined,
    target1: form.target.trim() || undefined,
    target2: undefined,
  };
}

export function CreateThesisModal({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreate: (t: Thesis) => void;
}) {
  const initial: FormState = useMemo(
    () => ({
      title: "Clarity Act passes, not priced into BTCUSD",
      thesisStatement:
        "If the Clarity Act advances meaningfully through Congress, BTCUSD rerates higher because regulatory clarity is still underpriced.",
      asset: "BTCUSD",
      marketMisread: "Market still treats US crypto legislation as low-probability noise.",
      trigger: "Committee approval / leadership support / floor scheduling",
      invalidation: "Bill stalls politically or hostile amendments destroy market relevance",
      horizon: "2–8 weeks",
      probability: "61",
      entry: "",
      stop: "",
      target: "",
    }),
    [],
  );

  const [form, setForm] = useState<FormState>(initial);

  function set<K extends keyof FormState>(k: K, v: string) {
    setForm((cur) => ({ ...cur, [k]: v }));
  }

  const canSubmit =
    form.title.trim() &&
    form.thesisStatement.trim() &&
    form.asset.trim() &&
    form.marketMisread.trim() &&
    form.trigger.trim() &&
    form.invalidation.trim() &&
    form.horizon.trim();

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setForm(initial);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[200] bg-black/55" />
        <Dialog.Content
          className={cn(
            // Mobile: fullscreen sheet. Desktop: centered modal.
            "fixed inset-0 z-[201] w-full max-w-none translate-x-0 translate-y-0",
            "rounded-none border-0 bg-[#0c0c0e] shadow-2xl",
            "sm:left-1/2 sm:top-1/2 sm:inset-auto sm:w-[92vw] sm:max-w-2xl sm:-translate-x-1/2 sm:-translate-y-1/2",
            "sm:rounded-xl sm:border sm:border-white/[0.08]",
            "focus:outline-none",
          )}
          aria-describedby={undefined}
        >
          <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-5 py-4">
            <div>
              <Dialog.Title className="text-sm font-semibold text-zinc-100">Create new thesis</Dialog.Title>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                Private for now — public publishing and leaderboard coming later.
              </p>
            </div>
            <Dialog.Close
              className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-900/60 hover:text-zinc-300"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="h-[calc(100dvh-132px)] overflow-y-auto px-5 py-4 sm:max-h-[70vh] sm:h-auto">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
                  Thesis title
                </label>
                <input
                  value={form.title}
                  onChange={(e) => set("title", e.target.value)}
                  className="mt-2 w-full rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-3 text-[16px] text-zinc-200 placeholder:text-zinc-600 sm:py-2 sm:text-[12px]"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
                  Thesis statement
                </label>
                <textarea
                  value={form.thesisStatement}
                  onChange={(e) => set("thesisStatement", e.target.value)}
                  rows={3}
                  className="mt-2 w-full resize-none rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-3 text-[16px] leading-relaxed text-zinc-200 placeholder:text-zinc-600 sm:py-2 sm:text-[12px]"
                />
              </div>

              <div>
                <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Asset / ticker</label>
                <input
                  value={form.asset}
                  onChange={(e) => set("asset", e.target.value)}
                  className="mt-2 w-full rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-3 font-mono text-[16px] text-zinc-200 placeholder:text-zinc-600 sm:py-2 sm:text-[12px]"
                />
              </div>

              <div>
                <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
                  Confidence / starting probability
                </label>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    value={form.probability}
                    onChange={(e) => set("probability", e.target.value)}
                    className="w-28 rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-3 text-[16px] text-zinc-200 placeholder:text-zinc-600 sm:py-2 sm:text-[12px]"
                    inputMode="numeric"
                  />
                  <span className="text-[11px] text-zinc-500">%</span>
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
                  Why the market hasn&apos;t caught up yet
                </label>
                <textarea
                  value={form.marketMisread}
                  onChange={(e) => set("marketMisread", e.target.value)}
                  rows={2}
                  className="mt-2 w-full resize-none rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-3 text-[16px] leading-relaxed text-zinc-200 placeholder:text-zinc-600 sm:py-2 sm:text-[12px]"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Key trigger</label>
                <textarea
                  value={form.trigger}
                  onChange={(e) => set("trigger", e.target.value)}
                  rows={2}
                  className="mt-2 w-full resize-none rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-3 text-[16px] leading-relaxed text-zinc-200 placeholder:text-zinc-600 sm:py-2 sm:text-[12px]"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Invalidation</label>
                <textarea
                  value={form.invalidation}
                  onChange={(e) => set("invalidation", e.target.value)}
                  rows={2}
                  className="mt-2 w-full resize-none rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-3 text-[16px] leading-relaxed text-zinc-200 placeholder:text-zinc-600 sm:py-2 sm:text-[12px]"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Time horizon</label>
                <input
                  value={form.horizon}
                  onChange={(e) => set("horizon", e.target.value)}
                  className="mt-2 w-full rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-3 text-[16px] text-zinc-200 placeholder:text-zinc-600 sm:py-2 sm:text-[12px]"
                />
              </div>

              <div className="sm:col-span-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
                  Optional trade setup
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <input
                    value={form.entry}
                    onChange={(e) => set("entry", e.target.value)}
                    placeholder="Entry"
                    className="w-full rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-3 text-[16px] text-zinc-200 placeholder:text-zinc-600 sm:py-2 sm:text-[12px]"
                  />
                  <input
                    value={form.stop}
                    onChange={(e) => set("stop", e.target.value)}
                    placeholder="Stop"
                    className="w-full rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-3 text-[16px] text-zinc-200 placeholder:text-zinc-600 sm:py-2 sm:text-[12px]"
                  />
                  <input
                    value={form.target}
                    onChange={(e) => set("target", e.target.value)}
                    placeholder="Target"
                    className="w-full rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-3 text-[16px] text-zinc-200 placeholder:text-zinc-600 sm:py-2 sm:text-[12px]"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] px-5 py-4">
            <p className="text-[11px] text-zinc-500">
              DEPTH4 will monitor signals against your trigger and log probability changes over time (dummy).
            </p>
            <div className="flex items-center gap-2">
              <Dialog.Close className="min-h-11 rounded-md px-4 py-2.5 text-[14px] font-medium text-zinc-400 hover:bg-zinc-900/60 sm:min-h-0 sm:px-3 sm:py-2 sm:text-[11px] sm:text-zinc-500">
                Cancel
              </Dialog.Close>
              <button
                type="button"
                className={cn(
                  "min-h-11 rounded-md px-4 py-2.5 text-[14px] font-semibold sm:min-h-0 sm:px-3 sm:py-2 sm:text-[11px]",
                  canSubmit
                    ? "bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/25 hover:bg-amber-500/20"
                    : "bg-zinc-900/40 text-zinc-600 ring-1 ring-white/[0.06] cursor-not-allowed",
                )}
                disabled={!canSubmit}
                onClick={() => {
                  if (!canSubmit) return;
                  const thesis = buildUserThesis(form);
                  onCreate(thesis);
                  onOpenChange(false);
                  setForm(initial);
                }}
              >
                Create thesis
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

