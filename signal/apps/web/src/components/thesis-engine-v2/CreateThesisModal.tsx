"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { InsiderFlowSetupFields, type InsiderFlowFieldKey } from "@/components/thesis-engine-v2/InsiderFlowSetupFields";

type FormState = {
  mode: "choice" | "ai" | "review" | "manual";
  aiPrompt: string;
  title: string;
  asset: string;
  direction: "long" | "short";
  whyNow: string;
  whatsUnpriced: string;
  entrySetup: string;
  stop: string;
  target: string;
  thesisStatement: string;
  horizon: string;
  probability: string; // percent string
  // Scenario fields
  baseProb: string;
  baseConfirms: string;
  baseConsequence: string;
  bullProb: string;
  bullConfirms: string;
  bullConsequence: string;
  bearProb: string;
  bearConfirms: string;
  bearConsequence: string;

  // Insider Flow setup (optional)
  bullInstruments: string;
  bearInstruments: string;
  confirmTags: string;
  contradictTags: string;
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
  // Heuristic: higher conviction tends to imply stronger driver + clearer trade.
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

  const tradeLine = form.entrySetup || form.stop || form.target
    ? `Entry ${form.entrySetup || "—"} · Stop ${form.stop || "—"} · Target ${form.target || "—"}`
    : "Optional setup pending — define entry/stop/targets when trigger compresses.";
  const tradeProse =
    form.entrySetup || form.stop || form.target
      ? "Express the view using the levels in Trade plan once the gate in Trigger is observable; adjust sizing as evidence updates — keep numbers out of this sentence."
      : "Optional setup pending — define levels in Trade plan when trigger compresses.";

  return {
    id: nowId,
    slug: `${baseSlug}-${nowId.slice(-4)}`,
    title: title || "Untitled thesis",
    thesisStatement: form.thesisStatement.trim(),
    asset: asset || "—",
    direction: form.direction,
    probability: p || 50,
    status: p >= 65 ? "ready" : p >= 50 ? "active" : "watching",
    probabilityRationale:
      "Starting conviction reflects your framing. DEPTH4 will update probability as signals confirm or break the trigger.",
    origin: "user",

    hiddenDriver: "User thesis — driver defined by your framing; DEPTH4 will infer supporting drivers from incoming signals.",
    likelyPath: "Signals accumulate → trigger clarity improves → the market catches up → the trade resolves into targets or invalidation.",
    marketMisread: "",
    tradeExpression: `Cleanest expression: ${asset || "asset"} — ${tradeLine}`,

    whyNow: form.whyNow.trim(),
    whatsUnpriced: form.whatsUnpriced.trim(),
    trigger: form.entrySetup.trim(),
    trade: tradeProse,
    invalidation: form.bearConfirms.trim(),
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

    entryZone: form.entrySetup.trim() || undefined,
    stop: form.stop.trim() || undefined,
    target1: form.target.trim() || undefined,
    target2: undefined,

    scenarioOverrides: {
      base: {
        probability: clamp(Number.parseInt(form.baseProb || "0", 10) || 0, 0, 100),
        confirmation: form.baseConfirms.trim(),
        marketConsequence: form.baseConsequence.trim(),
      },
      bull: {
        probability: clamp(Number.parseInt(form.bullProb || "0", 10) || 0, 0, 100),
        confirmation: form.bullConfirms.trim(),
        marketConsequence: form.bullConsequence.trim(),
      },
      bear: {
        probability: clamp(Number.parseInt(form.bearProb || "0", 10) || 0, 0, 100),
        confirmation: form.bearConfirms.trim(),
        marketConsequence: form.bearConsequence.trim(),
      },
    },

    insiderFlow: {
      bullInstruments: form.bullInstruments
        .split(",")
        .map((s2) => s2.trim())
        .filter(Boolean),
      bearInstruments: form.bearInstruments
        .split(",")
        .map((s2) => s2.trim())
        .filter(Boolean),
      confirmTags: form.confirmTags
        .split(",")
        .map((s2) => s2.trim())
        .filter(Boolean),
      contradictTags: form.contradictTags
        .split(",")
        .map((s2) => s2.trim())
        .filter(Boolean),
    },
  };
}

function generateDraftFromPrompt(prompt: string): Pick<
  FormState,
  | "title"
  | "asset"
  | "direction"
  | "whyNow"
  | "whatsUnpriced"
  | "entrySetup"
  | "stop"
  | "target"
  | "thesisStatement"
  | "probability"
  | "horizon"
  | "baseProb"
  | "baseConfirms"
  | "baseConsequence"
  | "bullProb"
  | "bullConfirms"
  | "bullConsequence"
  | "bearProb"
  | "bearConfirms"
  | "bearConsequence"
  | "bullInstruments"
  | "bearInstruments"
  | "confirmTags"
  | "contradictTags"
> {
  const p = prompt.trim();
  const isShort = /\bshort\b|\bweaken\b|\bfade\b|\bdownside\b|\brace\b/i.test(p);
  const assetMatch = p.match(/\b([A-Z]{2,6}(?:USD)?)\b/);
  const asset = (assetMatch?.[1] ?? "—").toUpperCase();
  const title = p.length ? p.split(".")[0]!.slice(0, 72).trim() : "Untitled thesis";

  const tags: string[] = [];
  const contradict: string[] = [];
  if (/\bceasefire\b|\bpeace\b|\btalks\b/i.test(p)) tags.push("ceasefire", "peace talks");
  if (/\bceasefire\b|\bpeace\b|\btalks\b/i.test(p)) contradict.push("strikes", "escalation", "talks collapse");
  if (/\bfed\b|\bpivot\b|\brates\b|\bcpi\b/i.test(p)) tags.push("Fed pivot", "rates");
  if (/\bfed\b|\bpivot\b|\brates\b|\bcpi\b/i.test(p)) contradict.push("sticky inflation", "hawkish hold", "higher for longer");
  if (/\bopec\b|\bbrent\b|\bwti\b|\boil\b/i.test(p)) tags.push("OPEC cuts", "oil");
  if (/\bopec\b|\bbrent\b|\bwti\b|\boil\b/i.test(p)) contradict.push("output increase", "spare capacity", "demand slowdown");
  if (/\bstimulus\b|\bbill\b|\bpackage\b/i.test(p)) tags.push("stimulus package");
  if (/\btrade deal\b|\btariff\b/i.test(p)) tags.push("trade deal");

  const bullIns: string[] = [];
  const bearIns: string[] = [];
  if (/\bgold\b|\bxau\b/i.test(p)) bearIns.push("XAUUSD");
  if (/\boil\b|\bwti\b|\bbrent\b/i.test(p)) bearIns.push("WTI", "Brent");
  if (/\bdefen[cs]e\b|\bita\b/i.test(p)) bearIns.push("ITA");
  if (/\bbtc\b/i.test(p)) bullIns.push("BTC");
  if (/\btlt\b|\brates\b/i.test(p)) bullIns.push("TLT");

  return {
    title: title || "Untitled thesis",
    asset,
    direction: isShort ? "short" : "long",
    whyNow: "Catalyst window is opening — market is still positioned for the old regime.",
    whatsUnpriced: "Market is pricing the headline, not the second-order consequence.",
    entrySetup: "Wait for the confirm (headline + price reaction). Enter on follow-through / retest.",
    stop: "Invalidation level — if the confirm fails, stand down.",
    target: "Mean reprice toward fair value / next liquidity pocket.",
    thesisStatement: p.length ? p : "Describe your thesis in plain English, then generate a structured draft.",
    probability: "58",
    horizon: "2–8 weeks",
    baseProb: "40",
    baseConfirms: "Trend continues with noisy headlines.",
    baseConsequence: "Base trade plan remains operative.",
    bullProb: "35",
    bullConfirms: "Catalyst confirms direction early.",
    bullConsequence: "Accelerated path to targets.",
    bearProb: "25",
    bearConfirms: "Invalidation triggers hit.",
    bearConsequence: "Exit / reduce per advisory.",

    bullInstruments: bullIns.length ? bullIns.join(", ") : "BTC, TLT",
    bearInstruments: bearIns.length ? bearIns.join(", ") : "WTI, ITA",
    confirmTags: tags.length ? Array.from(new Set(tags)).join(", ") : "ceasefire, Fed pivot",
    contradictTags: contradict.length ? Array.from(new Set(contradict)).join(", ") : "strikes, escalation",
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
      mode: "choice",
      aiPrompt:
        "Peace talks reduce gold's war premium, but spot still reflects too much geopolitical risk.",
      title: "Sell GLD because peace progress will continue within weeks",
      thesisStatement:
        "If geopolitics de-escalates, gold's war premium comes out faster than current positioning implies.",
      asset: "XAUUSD",
      direction: "short",
      whyNow: "Talk-track is shifting; optionality is still priced for escalation.",
      whatsUnpriced: "Spot still reflects too much tail-risk premium vs. the new information set.",
      entrySetup: "Enter on failed bounce / lower-high after de-escalation headline confirms.",
      stop: "Re-escalation signal or price reclaim invalidates the fade.",
      target: "Reprice toward pre-premium range / next support shelf.",
      horizon: "2–8 weeks",
      probability: "61",
      baseProb: "40",
      baseConfirms: "Trend continues with noisy headlines.",
      baseConsequence: "Base trade plan remains operative.",
      bullProb: "35",
      bullConfirms: "Catalyst confirms direction early.",
      bullConsequence: "Accelerated path to targets.",
      bearProb: "25",
      bearConfirms: "Invalidation triggers hit.",
      bearConsequence: "Exit / reduce per advisory.",

      bullInstruments: "BTC, TLT",
      bearInstruments: "WTI, ITA",
      confirmTags: "ceasefire, peace talks",
      contradictTags: "strikes, escalation, talks collapse",
    }),
    [],
  );

  const [form, setForm] = useState<FormState>(initial);

  function set<K extends keyof FormState>(k: K, v: string) {
    setForm((cur) => ({ ...cur, [k]: v }));
  }

  const canSubmit =
    form.title.trim() &&
    form.asset.trim() &&
    form.thesisStatement.trim() &&
    form.whyNow.trim() &&
    form.whatsUnpriced.trim() &&
    form.entrySetup.trim() &&
    form.horizon.trim() &&
    form.baseConfirms.trim() &&
    form.baseConsequence.trim() &&
    form.bullConfirms.trim() &&
    form.bullConsequence.trim() &&
    form.bearConfirms.trim() &&
    form.bearConsequence.trim();

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setForm(initial);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[9998] bg-black/55" />
        <Dialog.Content
          className={cn(
            // NOTE: Keep this as a centered modal on all breakpoints so it’s always visibly distinct from the page.
            "fixed left-1/2 top-1/2 z-[9999] w-[92vw] max-w-2xl -translate-x-1/2 -translate-y-1/2",
            "bg-[#0c0c0e] ring-1 ring-white/[0.08]",
            "focus:outline-none",
          )}
          aria-describedby={undefined}
        >
          <div className="flex items-start justify-between gap-4 px-5 py-4">
            <div>
              <Dialog.Title className="text-sm font-semibold text-zinc-100">Create new thesis</Dialog.Title>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                Turn a rough macro idea into a structured thesis.
              </p>
            </div>
            <Dialog.Close
              className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-900/60 hover:text-zinc-300"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="h-px w-full bg-white/[0.06]" aria-hidden />

          <div className="h-[calc(100dvh-132px)] overflow-y-auto px-5 py-4 sm:max-h-[70vh] sm:h-auto">
            {form.mode === "choice" ? (
              <div className="grid gap-3">
                <button
                  type="button"
                  className="rounded-none border border-amber-500/25 bg-amber-500/10 px-4 py-4 text-left ring-1 ring-amber-500/20 hover:bg-amber-500/15"
                  onClick={() => set("mode", "ai")}
                >
                  <p className="text-[12px] font-semibold text-amber-200">Write with AI</p>
                  <p className="mt-1 text-[11px] text-zinc-400">Describe the idea. DEPTH4 drafts the thesis + scenarios.</p>
                </button>
                <button
                  type="button"
                  className="rounded-none border border-white/[0.08] bg-zinc-900/30 px-4 py-4 text-left ring-1 ring-white/[0.06] hover:bg-zinc-900/45"
                  onClick={() => set("mode", "manual")}
                >
                  <p className="text-[12px] font-semibold text-zinc-200">Start manually</p>
                  <p className="mt-1 text-[11px] text-zinc-500">Fill the structured fields yourself.</p>
                </button>
              </div>
            ) : null}

            {form.mode === "ai" ? (
              <div className="grid gap-3">
                <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
                  Describe your thesis in plain English
                </label>
                <textarea
                  value={form.aiPrompt}
                  onChange={(e) => set("aiPrompt", e.target.value)}
                  rows={6}
                  className="w-full resize-none rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-3 text-[14px] leading-relaxed text-zinc-200 placeholder:text-zinc-600"
                  placeholder="Example: Peace talks reduce gold's war premium, but spot still reflects too much geopolitical risk."
                />
                <p className="text-[11px] text-zinc-500">
                  Example: Peace talks reduce gold&apos;s war premium, but spot still reflects too much geopolitical risk.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="min-h-11 rounded-md bg-amber-500/15 px-4 py-2.5 text-[14px] font-semibold text-amber-200 ring-1 ring-amber-500/25 hover:bg-amber-500/20 sm:min-h-0 sm:px-3 sm:py-2 sm:text-[11px]"
                    onClick={() => {
                      const draft = generateDraftFromPrompt(form.aiPrompt);
                      setForm((cur) => ({ ...cur, ...draft, mode: "review" }));
                    }}
                    disabled={!form.aiPrompt.trim()}
                  >
                    Generate thesis draft
                  </button>
                  <button
                    type="button"
                    className="min-h-11 rounded-md px-4 py-2.5 text-[14px] font-medium text-zinc-400 hover:bg-zinc-900/60 sm:min-h-0 sm:px-3 sm:py-2 sm:text-[11px] sm:text-zinc-500"
                    onClick={() => set("mode", "choice")}
                  >
                    Back
                  </button>
                </div>
              </div>
            ) : null}

            {form.mode === "manual" || form.mode === "review" ? (
              <div className="grid gap-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Thesis title</label>
                    <input
                      value={form.title}
                      onChange={(e) => set("title", e.target.value)}
                      className="mt-2 w-full rounded-lg bg-zinc-900/40 px-3 py-3 text-[16px] text-zinc-200 placeholder:text-zinc-600 ring-1 ring-white/[0.06] sm:py-2 sm:text-[12px]"
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
                    <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Direction</label>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        className={cn(
                          "rounded-md px-3 py-2 text-[11px] font-semibold ring-1",
                          form.direction === "long"
                            ? "bg-emerald-500/15 text-emerald-200 ring-emerald-500/25"
                            : "bg-zinc-900/30 text-zinc-300 ring-white/[0.06] hover:bg-zinc-900/45",
                        )}
                        onClick={() => set("direction", "long")}
                      >
                        Long
                      </button>
                      <button
                        type="button"
                        className={cn(
                          "rounded-md px-3 py-2 text-[11px] font-semibold ring-1",
                          form.direction === "short"
                            ? "bg-red-500/15 text-red-200 ring-red-500/25"
                            : "bg-zinc-900/30 text-zinc-300 ring-white/[0.06] hover:bg-zinc-900/45",
                        )}
                        onClick={() => set("direction", "short")}
                      >
                        Short
                      </button>
                    </div>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Why now</label>
                    <textarea
                      value={form.whyNow}
                      onChange={(e) => set("whyNow", e.target.value)}
                      rows={2}
                      className="mt-2 w-full resize-none rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-3 text-[16px] leading-relaxed text-zinc-200 placeholder:text-zinc-600 sm:py-2 sm:text-[12px]"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">What&apos;s unpriced</label>
                    <textarea
                      value={form.whatsUnpriced}
                      onChange={(e) => set("whatsUnpriced", e.target.value)}
                      rows={2}
                      className="mt-2 w-full resize-none rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-3 text-[16px] leading-relaxed text-zinc-200 placeholder:text-zinc-600 sm:py-2 sm:text-[12px]"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Entry setup</label>
                    <textarea
                      value={form.entrySetup}
                      onChange={(e) => set("entrySetup", e.target.value)}
                      rows={2}
                      className="mt-2 w-full resize-none rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-3 text-[16px] leading-relaxed text-zinc-200 placeholder:text-zinc-600 sm:py-2 sm:text-[12px]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Stop</label>
                    <input
                      value={form.stop}
                      onChange={(e) => set("stop", e.target.value)}
                      className="mt-2 w-full rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-3 text-[16px] text-zinc-200 placeholder:text-zinc-600 sm:py-2 sm:text-[12px]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Target</label>
                    <input
                      value={form.target}
                      onChange={(e) => set("target", e.target.value)}
                      className="mt-2 w-full rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-3 text-[16px] text-zinc-200 placeholder:text-zinc-600 sm:py-2 sm:text-[12px]"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Thesis title-line (plain English)</label>
                    <textarea
                      value={form.thesisStatement}
                      onChange={(e) => set("thesisStatement", e.target.value)}
                      rows={3}
                      className="mt-2 w-full resize-none rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-3 text-[16px] leading-relaxed text-zinc-200 placeholder:text-zinc-600 sm:py-2 sm:text-[12px]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Starting probability</label>
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

                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Time horizon</label>
                    <input
                      value={form.horizon}
                      onChange={(e) => set("horizon", e.target.value)}
                      className="mt-2 w-full rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-3 text-[16px] text-zinc-200 placeholder:text-zinc-600 sm:py-2 sm:text-[12px]"
                    />
                  </div>
                </div>

                <div className="h-px w-full bg-white/[0.06]" aria-hidden />

                <div className="grid gap-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Scenarios</p>

                  <div className="grid gap-3 rounded-none border border-white/[0.06] bg-zinc-900/20 p-3">
                    <p className="text-[11px] font-semibold text-zinc-200">Base case</p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <input
                        value={form.baseProb}
                        onChange={(e) => set("baseProb", e.target.value)}
                        className="rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-2 text-[12px] text-zinc-200"
                        inputMode="numeric"
                        placeholder="Probability %"
                      />
                      <textarea
                        value={form.baseConfirms}
                        onChange={(e) => set("baseConfirms", e.target.value)}
                        className="sm:col-span-2 resize-none rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-2 text-[12px] text-zinc-200"
                        rows={2}
                        placeholder="Confirms"
                      />
                      <textarea
                        value={form.baseConsequence}
                        onChange={(e) => set("baseConsequence", e.target.value)}
                        className="sm:col-span-3 resize-none rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-2 text-[12px] text-zinc-200"
                        rows={2}
                        placeholder="Consequence"
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 rounded-none border border-white/[0.06] bg-zinc-900/20 p-3">
                    <p className="text-[11px] font-semibold text-zinc-200">Bull case</p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <input
                        value={form.bullProb}
                        onChange={(e) => set("bullProb", e.target.value)}
                        className="rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-2 text-[12px] text-zinc-200"
                        inputMode="numeric"
                        placeholder="Probability %"
                      />
                      <textarea
                        value={form.bullConfirms}
                        onChange={(e) => set("bullConfirms", e.target.value)}
                        className="sm:col-span-2 resize-none rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-2 text-[12px] text-zinc-200"
                        rows={2}
                        placeholder="Confirms"
                      />
                      <textarea
                        value={form.bullConsequence}
                        onChange={(e) => set("bullConsequence", e.target.value)}
                        className="sm:col-span-3 resize-none rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-2 text-[12px] text-zinc-200"
                        rows={2}
                        placeholder="Consequence"
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 rounded-none border border-white/[0.06] bg-zinc-900/20 p-3">
                    <p className="text-[11px] font-semibold text-zinc-200">Bear case</p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <input
                        value={form.bearProb}
                        onChange={(e) => set("bearProb", e.target.value)}
                        className="rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-2 text-[12px] text-zinc-200"
                        inputMode="numeric"
                        placeholder="Probability %"
                      />
                      <textarea
                        value={form.bearConfirms}
                        onChange={(e) => set("bearConfirms", e.target.value)}
                        className="sm:col-span-2 resize-none rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-2 text-[12px] text-zinc-200"
                        rows={2}
                        placeholder="Confirms"
                      />
                      <textarea
                        value={form.bearConsequence}
                        onChange={(e) => set("bearConsequence", e.target.value)}
                        className="sm:col-span-3 resize-none rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-2 text-[12px] text-zinc-200"
                        rows={2}
                        placeholder="Consequence"
                      />
                    </div>
                  </div>
                </div>

                <div className="h-px w-full bg-white/[0.06]" aria-hidden />

                <InsiderFlowSetupFields
                  bullInstruments={form.bullInstruments}
                  bearInstruments={form.bearInstruments}
                  confirmTags={form.confirmTags}
                  contradictTags={form.contradictTags}
                  onChange={(key: InsiderFlowFieldKey, value: string) => set(key, value)}
                  largeTouch
                />
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] px-5 py-4">
            <p className="text-[11px] text-zinc-500">
              DEPTH4 will monitor signals against your trigger and log probability changes over time.
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

