"use client";

import { useMemo, useState } from "react";
import type { ThesisDetailBundle, ThesisEvidence, ThesisStatus } from "@/lib/thesis-engine-v2/types";
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
    case "actionable":
      return "entry possible";
    case "active":
      return "manage";
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

function answerFor(question: QuestionId, bundle: ThesisDetailBundle): AssistantAnswer {
  const t = bundle.thesis;
  const ev = latestEvidence(bundle.evidence);
  const d = evidenceDelta(ev);
  const strengthening = d > 0;
  const weakening = d < 0;

  const baseWhy =
    t.status === "actionable"
      ? "The thesis has crossed your confidence threshold, but the trigger and price setup still matter."
      : t.status === "active"
        ? "A position is open against this thesis. Manage risk first, then reassess on new evidence."
        : "This is not in a trade-ready state yet. Treat it as monitoring until the trigger is clearer.";

  const whatWouldChange =
    t.status === "actionable"
      ? `Clear trigger confirmation plus price acceptance around the setup zone (${t.entryZone ?? "your entry zone"}).`
      : t.status === "active"
        ? "A meaningful probability drop, a failed reaction to good news, or invalidation."
        : "A tighter trigger and a cleaner trade plan (entry + stop + target).";

  const riskToWatch = defaultRisk(bundle);

  if (question === "what_changed") {
    const changeLine = ev
      ? `Latest update: “${ev.headline}” (${ev.source}). Probability moved ${ev.probabilityBefore}% → ${ev.probabilityAfter}%.`
      : "No recent evidence logged in this dummy.";
    return {
      stance: "review",
      why: changeLine,
      change: "Another confirming update in the same direction, or a reversal headline that changes the driver.",
      risk: riskToWatch,
    };
  }

  if (question === "stop") {
    const stop = t.stop ? `One simple anchor is the listed stop: ${t.stop}.` : "Use the invalidation condition as the stop anchor.";
    const why = strengthening
      ? "If the thesis is strengthening, consider tightening to reduce giveback while staying inside the thesis."
      : weakening
        ? "If the thesis is weakening, keep stops strict and avoid giving it extra room."
        : "Use a stop that matches the thesis invalidation—not just a random price level.";
    return {
      stance: "risk management",
      why: `${stop} ${why}`,
      change: "A fresh probability jump with clean price follow-through can justify more room; a drop should do the opposite.",
      risk: riskToWatch,
    };
  }

  if (question === "take_profit") {
    const tp =
      t.target2 || t.target1
        ? `Targets in this thesis: ${[t.target1, t.target2].filter(Boolean).join(" / ")}.`
        : "No explicit targets are set here—treat this as thesis-led management, not a fixed-point prediction.";
    return {
      stance: "plan exits",
      why: tp,
      change: "If the thesis probability peaks then stalls, consider taking partials even before the final target.",
      risk: "Sharp headline reversals can erase thesis-driven moves quickly.",
    };
  }

  if (question === "enter") {
    const stance = t.status === "actionable" ? "entry possible" : "wait";
    const why =
      t.status === "actionable"
        ? `Probability is elevated (${t.probability}%) and the thesis is marked actionable. The remaining question is whether price is in your setup zone (${t.entryZone ?? "not specified"}).`
        : "This thesis is not marked actionable. Treat it as monitoring until the trigger and setup are clearer.";
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
      base === "manage"
        ? `current stance: hold / manage`
        : base === "entry possible"
          ? `current stance: entry possible`
          : base === "stand down"
            ? `current stance: stand down`
            : `current stance: wait`;

    const why =
      strengthening
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
    stance: `current stance: ${t.status === "actionable" ? "entry possible" : t.status === "active" ? "manage" : "wait"}`,
    why: t.marketMisread,
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

export function ThesisAssistantPanel({ bundle }: { bundle: ThesisDetailBundle }) {
  const [q, setQ] = useState<QuestionId>("wait_or_act");
  const ans = useMemo(() => answerFor(q, bundle), [bundle, q]);

  return (
    <section className="rounded-lg border border-white/[0.06] bg-zinc-900/25 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Talk to this thesis</h2>
        <span className="text-[11px] text-zinc-600">Decision support (dummy)</span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {QUESTIONS.map((it) => (
          <button
            key={it.id}
            type="button"
            onClick={() => setQ(it.id)}
            className={cn(
              "min-h-11 rounded-md px-3 py-2 text-[13px] font-semibold ring-1 transition-colors sm:min-h-0 sm:text-[11px]",
              q === it.id
                ? "bg-amber-500/12 text-amber-200 ring-amber-500/25"
                : "bg-zinc-900/30 text-zinc-300 ring-white/[0.06] hover:bg-zinc-900/45",
            )}
          >
            {it.label}
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-white/[0.06] bg-zinc-950/30 p-4">
        <div className="space-y-3 text-[13px] leading-relaxed text-zinc-300 sm:text-[12px]">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">1) Current stance</p>
            <p className="mt-1 font-medium text-zinc-100">{ans.stance}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">2) Why</p>
            <p className="mt-1">{ans.why}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">3) What would change this</p>
            <p className="mt-1">{ans.change}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">4) Risk to watch</p>
            <p className="mt-1">{ans.risk}</p>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">Ask a custom question</label>
        <input
          disabled
          placeholder="Coming later"
          className="mt-2 w-full rounded-md border border-white/[0.08] bg-zinc-900/20 px-3 py-3 text-[16px] text-zinc-500 placeholder:text-zinc-600 sm:py-2 sm:text-[12px]"
        />
      </div>
    </section>
  );
}

