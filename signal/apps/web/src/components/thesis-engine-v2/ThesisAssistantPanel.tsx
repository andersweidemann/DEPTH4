"use client";

import { useMemo, useState } from "react";
import type { Position, ThesisDetailBundle, ThesisEvidence, ThesisStatus } from "@/lib/thesis-engine-v2/types";
import { cn } from "@/lib/utils";

type QuestionId = "enter" | "wait_or_act" | "stop" | "take_profit" | "what_changed" | "explain_simply";

type AssistantAnswer = {
  stance: string;
  why: string;
  change: string;
  risk: string;
};

function latestEvidence(evidence: ThesisEvidence[]) {
  return evidence?.[0];
}

function evidenceDelta(ev?: ThesisEvidence) {
  if (!ev) return 0;
  return ev.probabilityAfter - ev.probabilityBefore;
}

function statusStance(status: ThesisStatus) {
  switch (status) {
    case "ready":
      return "entry possible";
    case "active":
      return "manage";
    case "forming":
    case "watching":
      return "wait";
    case "resolved":
      return "stand down";
    case "invalidated":
      return "stand down";
    default:
      return "wait";
  }
}

function defaultRisk(bundle: ThesisDetailBundle) {
  const t = bundle.thesis;
  if (t.stop) return `Price moving beyond your stop (${t.stop}).`;
  return `The thesis breaking via invalidation: ${t.invalidation}`;
}

function bookLine(book: Position | null | undefined): string {
  if (!book || book.tradeStatus !== "open") return "";
  const e = typeof book.entryPrice === "number" ? ` @ ${book.entryPrice}` : "";
  return ` Your Book line: open ${book.side.toUpperCase()} ${book.symbol}${e}.`;
}

function answerFor(question: QuestionId, bundle: ThesisDetailBundle, book: Position | null | undefined): AssistantAnswer {
  const t = bundle.thesis;
  const ev = latestEvidence(bundle.evidence);
  const d = evidenceDelta(ev);
  const strengthening = d > 0;
  const weakening = d < 0;
  const hasOpenBook = !!(book && book.tradeStatus === "open");

  const baseWhy =
    t.status === "ready"
      ? "The thesis has crossed your confidence threshold, but the trigger and price setup still matter."
      : t.status === "active"
        ? "A position is open against this thesis. Manage risk first, then reassess on new evidence."
        : "This is not in a trade-ready state yet. Treat it as monitoring until the trigger is clearer.";

  const whatWouldChange =
    t.status === "ready"
      ? `Clear trigger confirmation plus price acceptance around the setup zone (${t.entryZone ?? "your entry zone"}).`
      : t.status === "active"
        ? "A meaningful probability drop, a failed reaction to good news, or invalidation."
        : "A tighter trigger and a cleaner trade plan (entry + stop + target).";

  const riskToWatch = defaultRisk(bundle);

  if (question === "what_changed") {
    const changeLine = ev
      ? `Latest update: “${ev.headline}” (${ev.source}). Probability moved ${ev.probabilityBefore}% → ${ev.probabilityAfter}%.`
      : "No recent evidence logged in this dummy.";
    const bookPn =
      hasOpenBook && typeof book?.unrealizedPnlNumeric === "number"
        ? ` Book mark: ${book.unrealizedPnlNumeric >= 0 ? "+" : ""}${book.unrealizedPnlNumeric.toFixed(2)} (dummy).`
        : "";
    return {
      stance: "review",
      why: `${changeLine}${bookPn}`,
      change: "Another confirming update in the same direction, or a reversal headline that changes the driver.",
      risk: riskToWatch,
    };
  }

  if (question === "stop") {
    const stop = t.stop ? `One simple anchor is the listed stop: ${t.stop}.` : "Use the invalidation condition as the stop anchor.";
    const bookStop =
      hasOpenBook && typeof book?.stopLoss === "number"
        ? ` Your logged stop on the Book line: ${book.stopLoss}.`
        : hasOpenBook
          ? " Add / confirm a stop on the Book line if you trade with hard risk."
          : "";
    const why = strengthening
      ? "If the thesis is strengthening, consider tightening to reduce giveback while staying inside the thesis."
      : weakening
        ? "If the thesis is weakening, keep stops strict and avoid giving it extra room."
        : "Use a stop that matches the thesis invalidation—not just a random price level.";
    return {
      stance: "risk management",
      why: `${stop}${bookStop} ${why}`,
      change: "A fresh probability jump with clean price follow-through can justify more room; a drop should do the opposite.",
      risk: riskToWatch,
    };
  }

  if (question === "take_profit") {
    const bookTp =
      hasOpenBook && (book?.takeProfit != null)
        ? ` Your Book take-profit field: ${book.takeProfit}.`
        : "";
    const tp =
      t.target2 || t.target1
        ? `Targets in this thesis: ${[t.target1, t.target2].filter(Boolean).join(" / ")}.${bookTp}`
        : `No explicit targets are set here—treat this as thesis-led management, not a fixed-point prediction.${bookTp}`;
    return {
      stance: "plan exits",
      why: tp,
      change: "If the thesis probability peaks then stalls, consider taking partials even before the final target.",
      risk: "Sharp headline reversals can erase thesis-driven moves quickly.",
    };
  }

  if (question === "enter") {
    if (hasOpenBook) {
      return {
        stance: "manage — book is open",
        why: `You already have an open position linked to this thesis.${bookLine(book)} DEPTH4 “Ready” describes the idea, not whether to double a live line. Size up only if your plan says so.`,
        change: "A clean invalidation / risk event, or a planned scale rule — not a second discretionary entry off the same headline.",
        risk: riskToWatch,
      };
    }
    const stance = t.status === "ready" ? "entry possible" : "wait";
    const why =
      t.status === "ready"
        ? `Probability is elevated (${t.probability}%) and the thesis is marked Ready (entry setup valid). The remaining question is whether price is in your setup zone (${t.entryZone ?? "not specified"}).`
        : "This thesis is not marked Ready. Treat it as monitoring until the trigger and setup are clearer.";
    return {
      stance,
      why,
      change: whatWouldChange,
      risk: riskToWatch,
    };
  }

  if (question === "wait_or_act") {
    const base = statusStance(t.status);
    const stance =
      hasOpenBook
        ? "current stance: act on risk / manage the book line"
        : base === "manage"
          ? `current stance: hold / manage`
          : base === "entry possible"
            ? `current stance: entry possible`
            : base === "stand down"
              ? `current stance: stand down`
              : `current stance: wait`;

    const why =
      hasOpenBook
        ? `Thesis state: ${t.status} · ${t.probability}%.${bookLine(book)} Act means manage stops, size, and invalidation vs the thesis — not chase new entries unless planned.`
        : strengthening
          ? `Evidence is strengthening (latest move: ${d > 0 ? "+" : ""}${d} pts). Keep focus on trigger + price response.`
          : weakening
            ? `Evidence is weakening (latest move: ${d} pts). Avoid forcing entries; prioritize risk control.`
            : baseWhy;

    return {
      stance,
      why,
      change: whatWouldChange,
      risk: riskToWatch,
    };
  }

  // explain_simply
  return {
    stance: `current stance: ${hasOpenBook ? "manage book + thesis" : t.status === "ready" ? "entry possible" : t.status === "active" ? "manage" : "wait"}`,
    why: `${t.marketMisread}${bookLine(book)}`,
    change: `Trigger: ${t.trigger}`,
    risk: `Invalidation: ${t.invalidation}`,
  };
}

const QUESTIONS: { id: QuestionId; label: string }[] = [
  { id: "enter", label: "Enter now?" },
  { id: "wait_or_act", label: "Wait or act?" },
  { id: "stop", label: "Stop-loss?" },
  { id: "take_profit", label: "Take-profit?" },
  { id: "what_changed", label: "What changed?" },
  { id: "explain_simply", label: "Explain simply" },
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
  const [q, setQ] = useState<QuestionId>("wait_or_act");
  const ans = useMemo(() => answerFor(q, bundle, openBookPosition ?? null), [bundle, openBookPosition, q]);
  const drawer = variant === "drawer";

  return (
    <section
      className={cn(
        "rounded-lg border border-white/[0.06] bg-zinc-900/25",
        drawer ? "p-3 sm:p-4" : "p-5",
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className={cn("font-semibold uppercase tracking-[0.14em] text-zinc-500", drawer ? "text-[10px]" : "text-[11px]")}>
          {drawer ? "Trade desk (quick)" : "Talk to this thesis"}
        </h2>
        <span className={cn("text-zinc-600", drawer ? "text-[10px]" : "text-[11px]")}>
          {drawer ? "Rules + Book" : "Decision support (dummy)"}
        </span>
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

      <div className={cn("rounded-lg border border-white/[0.06] bg-zinc-950/30", drawer ? "mt-2 p-3" : "mt-4 p-4")}>
        <div
          className={cn(
            "space-y-2 leading-relaxed text-zinc-300",
            drawer ? "text-[11px] sm:space-y-2 sm:text-[11px]" : "space-y-3 text-[13px] sm:text-[12px]",
          )}
        >
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-zinc-600">Stance</p>
            <p className={cn("font-medium text-zinc-100", drawer ? "mt-0.5 line-clamp-2" : "mt-1")}>{ans.stance}</p>
          </div>
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-zinc-600">Why</p>
            <p className={cn(drawer ? "mt-0.5 line-clamp-4" : "mt-1")}>{ans.why}</p>
          </div>
          {drawer ? (
            <p className="text-[9px] text-zinc-500">
              <span className="font-semibold text-zinc-600">Shift if · </span>
              <span className="line-clamp-2">{ans.change}</span>
            </p>
          ) : null}
          {!drawer ? (
            <>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">What would change this</p>
                <p className="mt-1">{ans.change}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">Risk to watch</p>
                <p className="mt-1">{ans.risk}</p>
              </div>
            </>
          ) : (
            <p className="text-[9px] text-zinc-600">
              <span className="font-semibold text-zinc-500">Risk · </span>
              <span className="line-clamp-2">{ans.risk}</span>
            </p>
          )}
        </div>
      </div>

      {!drawer ? (
        <div className="mt-4">
          <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">Ask a custom question</label>
          <input
            disabled
            placeholder="Coming later"
            className="mt-2 w-full rounded-md border border-white/[0.08] bg-zinc-900/20 px-3 py-3 text-[16px] text-zinc-500 placeholder:text-zinc-600 sm:py-2 sm:text-[12px]"
          />
        </div>
      ) : null}
    </section>
  );
}

