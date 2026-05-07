"use client";

import { useMemo, useState } from "react";
import type { Position, ThesisDetailBundle, ThesisEvidence } from "@/lib/thesis-engine-v2/types";
import { cn } from "@/lib/utils";

type QuestionId = "suggest" | "entry" | "risk" | "changed" | "simple";

type AssistantAnswer = {
  assessment: string;
  context: string;
  considerations: string;
  riskFactors: string;
};

function latestEvidence(evidence: ThesisEvidence[]) {
  return evidence?.[0];
}

function evidenceDelta(ev?: ThesisEvidence) {
  if (!ev) return 0;
  return ev.probabilityAfter - ev.probabilityBefore;
}

function answerFor(question: QuestionId, bundle: ThesisDetailBundle, book: Position | null | undefined): AssistantAnswer {
  const t = bundle.thesis;
  const ev = latestEvidence(bundle.evidence);
  void evidenceDelta(ev);
  const hasOpenBook = !!(book && book.tradeStatus === "open");

  const statusLine = `Thesis status: ${t.status} · probability ${t.probability}%.`;
  const lastUpdateLine = ev
    ? `Latest evidence: “${ev.headline}” (${ev.source}) · ${ev.probabilityBefore}% → ${ev.probabilityAfter}%.`
    : "Latest evidence: none logged (dummy).";

  const mapping =
    t.status === "invalidated"
      ? "Invalidation conditions appear to have been triggered according to the thesis framework."
      : t.status === "resolved"
        ? "The thesis is marked resolved; new entries may not be the intended behavior of this framework."
        : t.status === "watching" || t.status === "forming"
          ? "Setup conditions do not yet appear met according to the thesis framework."
          : t.status === "ready" && !hasOpenBook
            ? "Entry conditions appear to be met according to the thesis framework, but independent verification still matters."
            : t.status === "ready" && hasOpenBook
              ? "Thesis conditions appear intact based on current state, with an open Book position linked."
              : hasOpenBook
                ? "A Book position is open against this thesis; the thesis state can be monitored for changes and invalidation risk."
                : "The thesis is active; conditions may support monitoring for follow-through and invalidation signals.";

  const invalidationLine = `Invalidation would occur if: ${t.invalidation}`;
  const entryZoneLine = t.entryZone ? `Entry zone (thesis-defined): ${t.entryZone}.` : "Entry zone: not specified in this thesis.";
  const triggerLine = `Trigger (thesis-defined): ${t.trigger}`;

  if (question === "changed") {
    return {
      assessment: "The thesis framework indicates the most recent change is driven by the latest evidence update.",
      context: `${statusLine} ${lastUpdateLine}`,
      considerations:
        "A second confirming update within a short window may strengthen confidence. A contradictory headline, muted price response, or probability reversal may weaken the setup.",
      riskFactors: `${invalidationLine} Headline-driven reversals and regime shifts are key risks to monitor.`,
    };
  }

  if (question === "entry") {
    return {
      assessment: mapping,
      context: `${statusLine} ${entryZoneLine} ${triggerLine}`,
      considerations:
        "Confirm that the trigger is observable and that price behavior aligns with the thesis narrative. Consider whether liquidity, volatility, and timing make the setup coherent within your plan.",
      riskFactors: `${invalidationLine} Consider monitoring for failed breakouts, sudden volatility, or news that contradicts the core driver.`,
    };
  }

  if (question === "risk") {
    return {
      assessment: "The thesis framework highlights invalidation conditions and adverse scenarios as the primary risk reference points.",
      context: `${statusLine} ${invalidationLine}`,
      considerations:
        "Risk may change as probability shifts and as new evidence arrives. A stable probability with constructive price response may reduce thesis fragility; a drift lower may increase it.",
      riskFactors:
        "Monitor for conditions that directly contradict the thesis driver, plus sudden gaps, liquidity events, or correlated shocks that can override the thesis path.",
    };
  }

  if (question === "simple") {
    return {
      assessment: "In plain terms, this thesis is a structured hypothesis about what could move the market and how it might play out.",
      context: `${statusLine} ${lastUpdateLine}`,
      considerations:
        "The framework becomes more actionable when a clear trigger appears and price behavior aligns with the described entry zone. The setup may weaken if evidence turns mixed or probability falls.",
      riskFactors: `${invalidationLine} Unexpected news and fast reversals are common failure modes for narrative theses.`,
    };
  }

  // suggest (default)
  return {
    assessment: mapping,
    context: `${statusLine} ${lastUpdateLine}`,
    considerations:
      "Consider whether the thesis driver is still valid, whether the trigger is clearly defined, and whether price action supports the narrative. A confirming sequence of evidence may strengthen; contradictions may weaken.",
    riskFactors: `${invalidationLine} Consider monitoring for adverse price moves, probability deterioration, and contradictory catalysts.`,
  };
}

const QUESTIONS: { id: QuestionId; label: string }[] = [
  { id: "suggest", label: "What does the thesis suggest?" },
  { id: "entry", label: "Entry conditions?" },
  { id: "risk", label: "Risk management considerations?" },
  { id: "changed", label: "What changed recently?" },
  { id: "simple", label: "Explain the thesis simply" },
];

export function ThesisAssistantPanel({
  bundle,
  variant = "default",
  openBookPosition,
}: {
  bundle: ThesisDetailBundle;
  variant?: "default" | "drawer";
  /** Open Book line for this thesis, if any — shapes answers. */
  openBookPosition?: Position | null;
}) {
  const [q, setQ] = useState<QuestionId>("suggest");
  const ans = useMemo(() => answerFor(q, bundle, openBookPosition ?? null), [bundle, openBookPosition, q]);
  const drawer = variant === "drawer";

  return (
    <section
      className={cn(
        "rounded-none bg-zinc-900/25",
        drawer ? "p-3 sm:p-3.5" : "p-4",
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className={cn("font-semibold uppercase tracking-[0.14em] text-zinc-500", drawer ? "text-[10px]" : "text-[11px]")}>
          {drawer ? "Thesis assistant" : "Ask about this thesis"}
        </h2>
        <span className={cn("text-zinc-600", drawer ? "text-[10px]" : "text-[11px]")}>
          {drawer ? "Informational (dummy)" : "Informational (dummy)"}
        </span>
      </div>

      <div className={cn("mt-2.5 bg-zinc-950/35", drawer ? "p-3" : "p-3.5")}>
        <p className={cn("leading-relaxed text-zinc-300", drawer ? "text-[11px]" : "text-[12px]")}>
          This assistant provides general thesis analysis for informational purposes only. It does not provide personalized investment advice.
          <br />
          All trading decisions and risk management are your sole responsibility.
        </p>
      </div>

      <div className={cn("flex flex-wrap gap-1.5", drawer ? "mt-2" : "mt-4", "sm:gap-2")}>
        {QUESTIONS.map((it) => (
          <button
            key={it.id}
            type="button"
            onClick={() => setQ(it.id)}
            className={cn(
              "rounded-md font-semibold ring-1 transition-colors",
              drawer
                ? "min-h-9 px-2 py-1.5 text-[10px] sm:min-h-0 sm:px-2.5 sm:py-1.5 sm:text-[10px]"
                : "min-h-11 px-3 py-2 text-[13px] sm:min-h-0 sm:text-[11px]",
              q === it.id
                ? "bg-amber-500/12 text-amber-200 ring-amber-500/25"
                : "bg-zinc-900/30 text-zinc-300 ring-white/[0.06] hover:bg-zinc-900/45",
            )}
          >
            {it.label}
          </button>
        ))}
      </div>

      <div className={cn("bg-zinc-950/30", drawer ? "mt-2 p-3" : "mt-3.5 p-3.5")}>
        <div
          className={cn(
            "space-y-2 leading-relaxed text-zinc-300",
            drawer ? "text-[11px] sm:space-y-2 sm:text-[11px]" : "space-y-3 text-[13px] sm:text-[12px]",
          )}
        >
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-zinc-600">Thesis assessment</p>
            <p className={cn("font-medium text-zinc-100", drawer ? "mt-0.5" : "mt-1")}>{ans.assessment}</p>
          </div>
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-zinc-600">Context</p>
            <p className={cn(drawer ? "mt-0.5" : "mt-1")}>{ans.context}</p>
          </div>
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-zinc-600">Considerations</p>
            <p className={cn(drawer ? "mt-0.5" : "mt-1")}>{ans.considerations}</p>
          </div>
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-zinc-600">Risk factors</p>
            <p className={cn(drawer ? "mt-0.5" : "mt-1")}>{ans.riskFactors}</p>
          </div>
        </div>
      </div>

      {!drawer ? (
        <div className="mt-4">
          <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">Ask a custom question</label>
          <input
            disabled
            placeholder="Future feature"
            className="mt-2 w-full rounded-md border border-white/[0.08] bg-zinc-900/20 px-3 py-3 text-[16px] text-zinc-500 placeholder:text-zinc-600 sm:py-2 sm:text-[12px]"
          />
        </div>
      ) : null}
    </section>
  );
}

