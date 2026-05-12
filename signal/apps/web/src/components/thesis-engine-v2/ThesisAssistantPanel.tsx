"use client";

import { useMemo, useState } from "react";
import type { Position, ThesisDetailBundle, ThesisEvidence } from "@/lib/thesis-engine-v2/types";
import { displayConvictionPctFromEngineThesis } from "@/lib/thesis-engine-v2/thesis-display-selectors";
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

  const statusLine = `Thesis status: ${t.status} · thesis conviction ${displayConvictionPctFromEngineThesis(t)}%.`;
  const lastUpdateLine = ev
    ? ev.logScenarioAfterStored === false
      ? `Latest evidence: “${ev.headline}” (${ev.source}) — scenarios were not re-modeled on this log row; compare the headline to your trigger.`
      : ev.probabilityBefore === ev.probabilityAfter
        ? `Latest evidence: “${ev.headline}” (${ev.source}) · conviction ${ev.probabilityBefore}% (no change).`
        : `Latest evidence: “${ev.headline}” (${ev.source}) · conviction ${ev.probabilityBefore}% → ${ev.probabilityAfter}%.`
    : "Latest evidence: none logged yet.";

  const mapping =
    t.status === "invalidated"
      ? "Invalidation looks live — stand down and re-read the tape before sizing again."
      : t.status === "resolved"
        ? "This thesis is marked resolved; fresh adds may not fit the same story."
        : t.status === "watching" || t.status === "forming"
          ? "Your trigger is not satisfied yet — watch the Trigger block, not the headline alone."
          : t.status === "ready" && !hasOpenBook
            ? "Trigger looks closer to met — still verify price, liquidity, and your own plan."
            : t.status === "ready" && hasOpenBook
              ? "Trigger lane still open and you have a Book line on — watch invalidation and size."
              : hasOpenBook
                ? "Book position is open on this name — track invalidation and any probability slide."
                : "Thesis is active — watch follow-through vs what would break the story.";

  const invalidationRef =
    "If the Invalidation block prints, treat the thesis as broken until you re-test it; odds should drop hard when that happens.";
  const levelsRef = t.entryZone ? "Entry, stop, and targets sit in Trade plan." : "Add levels to Trade plan when you have them.";
  const triggerGateLine =
    t.status === "watching" || t.status === "forming"
      ? "Wait for the Trigger gate before acting — the page says what \"live\" means."
      : t.status === "ready"
        ? "Closer to live — still cross-check Trigger, Trade, and Trade plan yourself."
        : "Use Trigger as the live gate vs price.";

  if (question === "changed") {
    return {
      assessment: "The latest evidence row is what moved the probability print.",
      context: `${statusLine} ${lastUpdateLine}`,
      considerations:
        "Back-to-back confirming headlines can add conviction. One ugly headline, dead price, or a sharp probability cut can kill the read fast.",
      riskFactors: `${invalidationRef} Watch headline whipsaws and shocks outside your written story.`,
    };
  }

  if (question === "entry") {
    return {
      assessment: mapping,
      context: `${statusLine} ${triggerGateLine} ${levelsRef}`,
      considerations:
        "Price has to agree with the story — and your size has to fit how you trade liquidity and time.",
      riskFactors: `${invalidationRef} Add failed breaks, sudden vol, and news that breaks the core driver.`,
    };
  }

  if (question === "risk") {
    return {
      assessment: "Invalidation is your hard stop story; everything else is extra weather.",
      context: `${statusLine} Trigger and Trade are your action gates; Trade plan holds the numbers.`,
      considerations:
        "Risk rises when odds slide on good tape, or when odds stay high but price goes the wrong way.",
      riskFactors: `${invalidationRef} Also gaps, thin liquidity, and shocks that kill the path before your written invalidation.`,
    };
  }

  if (question === "simple") {
    return {
      assessment: "Plain English: this is a timed bet on what happens next to a named asset, and what proves you wrong.",
      context: `${statusLine} ${lastUpdateLine}`,
      considerations:
        "It gets actionable when Trigger is obvious and price follows. Mixed evidence or falling odds usually weakens the edge.",
      riskFactors: `${invalidationRef} Headline reversals and chop are the usual tripwires.`,
    };
  }

  // suggest (default)
  return {
    assessment: mapping,
    context: `${statusLine} ${lastUpdateLine}`,
    considerations:
      "Ask: does the driver still match the tape? Is Trigger still the right gate? Does price agree with Trade — without repeating the hero line here.",
    riskFactors: `${invalidationRef} Watch probability bleed and catalysts that contradict the story.`,
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
          Informational only
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

    </section>
  );
}

